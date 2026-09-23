use serde_json::{json, Value};
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{mpsc, Arc, Mutex, OnceLock};
use std::time::Duration;
use tauri::{Emitter, Manager};

type Reply = Result<Value, String>;
struct Host {
    child: Child,
    input: ChildStdin,
    pending: Arc<Mutex<HashMap<u64, mpsc::Sender<Reply>>>>,
}
static HOST: OnceLock<Mutex<Option<Host>>> = OnceLock::new();
static SERIAL: AtomicU64 = AtomicU64::new(1);

fn request(app: tauri::AppHandle, method: String, params: Value) -> Reply {
    let (tx, rx) = mpsc::channel();
    let id = SERIAL.fetch_add(1, Ordering::Relaxed);
    {
        let mut guard = HOST
            .get_or_init(|| Mutex::new(None))
            .lock()
            .map_err(|e| e.to_string())?;
        if let Some(host) = guard.as_mut() {
            if host.child.try_wait().map_err(|e| e.to_string())?.is_some() {
                *guard = None;
            }
        }
        if guard.is_none() {
            let dir = app
                .path()
                .app_data_dir()
                .map_err(|e| e.to_string())?
                .join("workspaces");
            std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
            let script = dir.join("host-v05.cjs");
            std::fs::write(&script, include_str!("../../runtime/host.cjs"))
                .map_err(|e| e.to_string())?;
            let claude_sdk = dir.join("claude-sdk.mjs");
            std::fs::write(
                &claude_sdk,
                include_str!("../../node_modules/@anthropic-ai/claude-agent-sdk/sdk.mjs"),
            )
            .map_err(|e| e.to_string())?;
            let home = std::env::var("HOME").unwrap_or_default();
            let path = format!("{home}/.local/bin:{home}/.agenthub/npm-global/bin:/opt/homebrew/bin:/usr/local/bin:{}", std::env::var("PATH").unwrap_or_default());
            let mut child = Command::new("node")
                .arg(&script)
                .env("PATH", path)
                .env("AGENTHUB_DATA", &dir)
                .env("AGENTHUB_CLAUDE_SDK", &claude_sdk)
                .stdin(Stdio::piped())
                .stdout(Stdio::piped())
                .stderr(Stdio::null())
                .spawn()
                .map_err(|e| format!("无法启动本机会话服务，请确认 Node.js 已安装：{e}"))?;
            let input = child.stdin.take().ok_or("无法连接会话服务")?;
            let output = child.stdout.take().ok_or("无法读取会话服务")?;
            let pending: Arc<Mutex<HashMap<u64, mpsc::Sender<Reply>>>> =
                Arc::new(Mutex::new(HashMap::new()));
            let listeners = pending.clone();
            let app_events = app.clone();
            std::thread::spawn(move || {
                for line in BufReader::new(output).lines().map_while(Result::ok) {
                    if let Ok(msg) = serde_json::from_str::<Value>(&line) {
                        if let Some(event) = msg.get("event") {
                            let _ = app_events.emit("workspace-event", event);
                        } else if let Some(id) = msg["id"].as_u64() {
                            if let Some(tx) = listeners.lock().ok().and_then(|mut p| p.remove(&id))
                            {
                                let response = if let Some(e) = msg["error"].as_str() {
                                    Err(e.to_string())
                                } else {
                                    Ok(msg["result"].clone())
                                };
                                let _ = tx.send(response);
                            }
                        }
                    }
                }
                if let Ok(mut p) = listeners.lock() {
                    for (_, tx) in p.drain() {
                        let _ = tx.send(Err("会话服务已退出，请重试".into()));
                    }
                }
            });
            *guard = Some(Host {
                child,
                input,
                pending,
            });
        }
        let host = guard.as_mut().ok_or("会话服务不可用")?;
        host.pending
            .lock()
            .map_err(|e| e.to_string())?
            .insert(id, tx);
        writeln!(
            host.input,
            "{}",
            json!({"id":id,"method":method,"params":params})
        )
        .map_err(|e| e.to_string())?;
    }
    let result = rx
        .recv_timeout(Duration::from_secs(70))
        .map_err(|_| "等待会话服务超时".to_string());
    if result.is_err() {
        if let Ok(guard) = HOST.get().unwrap().lock() {
            if let Some(h) = guard.as_ref() {
                if let Ok(mut p) = h.pending.lock() {
                    p.remove(&id);
                }
            }
        }
    }
    result?
}

#[tauri::command]
pub async fn workspace_request(app: tauri::AppHandle, method: String, params: Value) -> Reply {
    tauri::async_runtime::spawn_blocking(move || request(app, method, params))
        .await
        .map_err(|e| e.to_string())?
}

// A native child webview is intentional: Kimi forbids cross-origin iframe embedding.
// No Tauri capabilities are granted to the remote child view.
#[tauri::command]
pub async fn workspace_webview(
    app: tauri::AppHandle,
    url: Option<String>,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
    visible: bool,
) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    let y = {
        let window = app.get_window("main").ok_or("找不到主窗口")?;
        let outer = window.outer_size().map_err(|e| e.to_string())?;
        let inner = window.inner_size().map_err(|e| e.to_string())?;
        let scale = window.scale_factor().map_err(|e| e.to_string())?;
        y + outer.height.saturating_sub(inner.height) as f64 / scale
    };
    // Set the complete rectangle atomically. Wry's separate size update reads
    // back a flipped Cocoa coordinate and can move a child above its DOM slot.
    let bounds = tauri::Rect {
        position: tauri::LogicalPosition::new(x, y).into(),
        size: tauri::LogicalSize::new(width.max(1.), height.max(1.)).into(),
    };
    let existing = app.get_webview("native-workspace");
    if !visible {
        if let Some(w) = existing {
            w.hide().map_err(|e| e.to_string())?;
        }
        return Ok(());
    }
    if let Some(url) = url {
        let parsed = tauri::Url::parse(&url).map_err(|e| e.to_string())?;
        if parsed.scheme() != "http"
            || !matches!(parsed.host_str(), Some("127.0.0.1" | "localhost"))
        {
            return Err("仅允许本机原生工作区".into());
        }
        if let Some(w) = existing {
            w.navigate(parsed).map_err(|e| e.to_string())?;
            w.set_bounds(bounds).map_err(|e| e.to_string())?;
            w.show().map_err(|e| e.to_string())?;
        } else {
            let window = app.get_window("main").ok_or("找不到主窗口")?;
            window
                .add_child(
                    tauri::webview::WebviewBuilder::new(
                        "native-workspace",
                        tauri::WebviewUrl::External(parsed),
                    ),
                    tauri::LogicalPosition::new(x, y),
                    tauri::LogicalSize::new(width.max(1.), height.max(1.)),
                )
                .map_err(|e| e.to_string())?;
        }
    } else if let Some(w) = existing {
        w.set_bounds(bounds).map_err(|e| e.to_string())?;
        w.show().map_err(|e| e.to_string())?;
    }
    Ok(())
}
