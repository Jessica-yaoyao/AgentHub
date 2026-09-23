use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::io::{BufRead, BufReader, Read, Write};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tauri::Manager;

/// 统一 PATH 前缀：独立 npm 前缀 + uv 工具目录，避免依赖用户 shell 配置
const PATH_PREFIX: &str =
    "export PATH=\"$HOME/.local/bin:$HOME/.agenthub/npm-global/bin:$HOME/.cargo/bin:$PATH\"; ";
const KEYCHAIN_SERVICE_PREFIX: &str = "com.agenthub.api-key";
const ALLOWED_API_KEYS: [&str; 5] = [
    "ANTHROPIC_API_KEY",
    "OPENAI_API_KEY",
    "GEMINI_API_KEY",
    "MOONSHOT_API_KEY",
    "DASHSCOPE_API_KEY",
];

#[derive(Debug, Serialize, Deserialize)]
pub struct AgentDetectionResult {
    pub agent_id: String,
    /// installed = 命令可用; broken = 命令存在但执行失败; missing = 未安装
    pub status: String,
    pub version: Option<String>,
    pub path: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct DesktopAppInfo {
    pub agent_id: String,
    pub installed: bool,
    pub version: Option<String>,
    pub app_path: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CommandResult {
    pub ok: bool,
    pub code: i32,
    pub stdout: String,
    pub stderr: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ApiKeyValidation {
    pub ok: bool,
    pub message: String,
    pub model: Option<String>,
}

fn shell() -> String {
    std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string())
}

fn wrap(command: &str) -> String {
    format!("{PATH_PREFIX}{command}")
}

fn expand_home(path: &str) -> String {
    let home = std::env::var("HOME").unwrap_or_default();
    if path == "~" {
        home
    } else if let Some(rest) = path.strip_prefix("~/") {
        format!("{home}/{rest}")
    } else {
        path.to_string()
    }
}

fn run_via_login_shell(command: &str) -> std::io::Result<std::process::Output> {
    Command::new(shell())
        .args(["-l", "-c", &wrap(command)])
        .output()
}

/// 带超时与工作目录的命令执行
fn run_with_timeout(command: &str, cwd: Option<&str>, timeout_secs: u64) -> CommandResult {
    run_with_timeout_env(command, cwd, timeout_secs, &[])
}

fn run_with_timeout_env(
    command: &str,
    cwd: Option<&str>,
    timeout_secs: u64,
    env_vars: &[(String, String)],
) -> CommandResult {
    let full = match cwd {
        Some(dir) if !dir.trim().is_empty() => {
            let expanded = expand_home(dir);
            format!("cd '{}' && {}", expanded.replace('\'', "'\\''"), command)
        }
        _ => command.to_string(),
    };
    let mut process = Command::new(shell());
    process
        .args(["-l", "-c", &wrap(&full)])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    for (key, value) in env_vars {
        process.env(key, value);
    }
    let child = process.spawn();

    let mut child = match child {
        Ok(c) => c,
        Err(e) => {
            return CommandResult {
                ok: false,
                code: -1,
                stdout: String::new(),
                stderr: format!("无法启动命令: {e}"),
            }
        }
    };

    let mut stdout_handle = child.stdout.take();
    let mut stderr_handle = child.stderr.take();

    let out_thread = std::thread::spawn(move || {
        let mut buf = String::new();
        if let Some(ref mut h) = stdout_handle {
            let _ = h.read_to_string(&mut buf);
        }
        buf
    });
    let err_thread = std::thread::spawn(move || {
        let mut buf = String::new();
        if let Some(ref mut h) = stderr_handle {
            let _ = h.read_to_string(&mut buf);
        }
        buf
    });

    let start = Instant::now();
    let timeout = Duration::from_secs(timeout_secs.max(1));
    loop {
        match child.try_wait() {
            Ok(Some(status)) => {
                let stdout = out_thread.join().unwrap_or_default();
                let stderr = err_thread.join().unwrap_or_default();
                return CommandResult {
                    ok: status.success(),
                    code: status.code().unwrap_or(-1),
                    stdout: stdout.trim().to_string(),
                    stderr: stderr.trim().to_string(),
                };
            }
            Ok(None) => {
                if start.elapsed() > timeout {
                    let _ = child.kill();
                    let _ = child.wait();
                    let stdout = out_thread.join().unwrap_or_default();
                    let stderr = err_thread.join().unwrap_or_default();
                    return CommandResult {
                        ok: false,
                        code: -2,
                        stdout: stdout.trim().to_string(),
                        stderr: format!("命令超时（{timeout_secs}s）已终止。{}", stderr.trim()),
                    };
                }
                std::thread::sleep(Duration::from_millis(50));
            }
            Err(e) => {
                return CommandResult {
                    ok: false,
                    code: -1,
                    stdout: String::new(),
                    stderr: format!("等待命令结束失败: {e}"),
                };
            }
        }
    }
}

/// 检测指定 Agent CLI：which 定位 → 版本命令验证，区分 已安装/异常/未安装
#[tauri::command]
pub async fn detect_agent(
    agent_id: String,
    check_command: String,
) -> Result<AgentDetectionResult, String> {
    let bin = check_command
        .split_whitespace()
        .next()
        .unwrap_or_default()
        .to_string();
    if bin.is_empty() {
        return Ok(AgentDetectionResult {
            agent_id,
            status: "missing".into(),
            version: None,
            path: None,
            error: None,
        });
    }

    // 1. which 定位（含 PATH 前缀，能找到独立前缀与 uv 工具目录里的二进制）
    let which_cmd = format!("which {bin}");
    let path = tauri::async_runtime::spawn_blocking(move || run_with_timeout(&which_cmd, None, 10))
        .await
        .map_err(|e| e.to_string())?;
    let bin_path = if path.ok && !path.stdout.is_empty() {
        Some(path.stdout.lines().next().unwrap_or("").to_string())
    } else {
        None
    };

    if bin_path.is_none() {
        return Ok(AgentDetectionResult {
            agent_id,
            status: "missing".into(),
            version: None,
            path: None,
            error: None,
        });
    }

    // 2. 版本命令验证（二进制存在但可能损坏，例如 codex vendor 缺失）
    let cc = check_command.clone();
    let result = tauri::async_runtime::spawn_blocking(move || run_with_timeout(&cc, None, 20))
        .await
        .map_err(|e| e.to_string())?;

    // 退出码为 0 即视为可用；版本输出可能在 stdout 或 stderr（如 pi 输出到 stderr）
    let text = if !result.stdout.is_empty() {
        result.stdout.clone()
    } else {
        result.stderr.clone()
    };
    if result.ok && !text.is_empty() {
        Ok(AgentDetectionResult {
            agent_id,
            status: "installed".into(),
            version: Some(text.lines().next().unwrap_or("").to_string()),
            path: bin_path,
            error: None,
        })
    } else {
        let detail = if !result.stderr.is_empty() {
            result.stderr
        } else {
            result.stdout
        };
        Ok(AgentDetectionResult {
            agent_id,
            status: "broken".into(),
            version: None,
            path: bin_path,
            error: Some(if detail.is_empty() {
                format!("命令执行失败，退出码 {}", result.code)
            } else {
                detail.chars().take(500).collect()
            }),
        })
    }
}

/// 批量检测多个 Agent CLI（并行）
#[tauri::command]
pub async fn detect_all_agents(
    checks: Vec<(String, String)>,
) -> Result<Vec<AgentDetectionResult>, String> {
    let mut handles = Vec::new();
    for (agent_id, check_command) in checks {
        handles.push(tauri::async_runtime::spawn(async move {
            detect_agent(agent_id, check_command).await
        }));
    }
    let mut results = Vec::new();
    for h in handles {
        if let Ok(Ok(r)) = h.await {
            results.push(r);
        }
    }
    Ok(results)
}

/// 扫描桌面应用（/Applications 与 ~/Applications），读取版本号
#[tauri::command]
pub async fn detect_desktop_apps(
    apps: Vec<(String, Vec<String>)>,
) -> Result<Vec<DesktopAppInfo>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let home = std::env::var("HOME").unwrap_or_default();
        let mut out = Vec::new();
        for (agent_id, names) in apps {
            let mut found: Option<(String, Option<String>)> = None;
            for name in &names {
                for base in ["/Applications".to_string(), format!("{home}/Applications")] {
                    let candidate = format!("{base}/{name}");
                    if std::path::Path::new(&candidate).exists() {
                        let version = Command::new("mdls")
                            .args(["-name", "kMDItemVersion", "-raw", &candidate])
                            .output()
                            .ok()
                            .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
                            .filter(|v| !v.is_empty() && v != "(null)");
                        found = Some((candidate, version));
                        break;
                    }
                }
                if found.is_some() {
                    break;
                }
            }
            match found {
                Some((p, v)) => out.push(DesktopAppInfo {
                    agent_id: agent_id.clone(),
                    installed: true,
                    version: v,
                    app_path: Some(p),
                }),
                None => out.push(DesktopAppInfo {
                    agent_id: agent_id.clone(),
                    installed: false,
                    version: None,
                    app_path: None,
                }),
            }
        }
        out
    })
    .await
    .map_err(|e| e.to_string())
}

/// 检查文件/目录是否存在（用于登录态判断），支持 ~ 展开
#[tauri::command]
pub async fn check_files_exist(paths: Vec<String>) -> Result<Vec<bool>, String> {
    let home = std::env::var("HOME").unwrap_or_default();
    Ok(paths
        .iter()
        .map(|p| {
            let expanded = if let Some(rest) = p.strip_prefix("~/") {
                format!("{home}/{rest}")
            } else {
                p.clone()
            };
            std::path::Path::new(&expanded).exists()
        })
        .collect())
}

/// 通用命令执行（安装 / 卸载 / 对话 / 终端），支持工作目录
#[tauri::command]
pub async fn run_command(
    command: String,
    cwd: Option<String>,
    timeout_secs: Option<u64>,
) -> Result<CommandResult, String> {
    let t = timeout_secs.unwrap_or(120);
    tauri::async_runtime::spawn_blocking(move || run_with_timeout(&command, cwd.as_deref(), t))
        .await
        .map_err(|e| e.to_string())
}

/// 在系统终端（macOS Terminal.app）中启动交互式 Agent CLI
#[tauri::command]
pub async fn launch_agent_terminal(command: String, cwd: Option<String>) -> Result<String, String> {
    let full = match cwd {
        Some(dir) if !dir.trim().is_empty() => {
            let expanded = expand_home(&dir);
            format!("cd '{}' && {}", expanded.replace('\'', "'\\''"), command)
        }
        _ => command,
    };
    let terminal_command = wrap(&full);
    let escaped = terminal_command.replace('\\', "\\\\").replace('"', "\\\"");
    let script =
        format!("tell application \"Terminal\"\nactivate\ndo script \"{escaped}\"\nend tell");
    let output = tauri::async_runtime::spawn_blocking(move || {
        Command::new("osascript").args(["-e", &script]).output()
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| format!("无法启动 Terminal.app: {e}"))?;

    if output.status.success() {
        Ok(format!("已在 Terminal.app 中启动: {full}"))
    } else {
        Err(format!(
            "Terminal.app 启动失败: {}",
            String::from_utf8_lossy(&output.stderr)
        ))
    }
}

/// 打开桌面应用（open -a 路径）
#[tauri::command]
pub async fn open_desktop_app(app_path: String) -> Result<String, String> {
    let path_for_spawn = app_path.clone();
    let output = tauri::async_runtime::spawn_blocking(move || {
        Command::new("open").arg(&path_for_spawn).output()
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())?;
    if output.status.success() {
        Ok(format!("已打开 {app_path}"))
    } else {
        Err(format!(
            "打开失败: {}",
            String::from_utf8_lossy(&output.stderr)
        ))
    }
}

// ---------------- API 密钥 / 模型 ----------------

fn ensure_allowed_api_key(key_name: &str) -> Result<(), String> {
    if ALLOWED_API_KEYS.contains(&key_name) {
        Ok(())
    } else {
        Err("不支持的 API 密钥类型".into())
    }
}

fn keychain_service(key_name: &str) -> String {
    format!("{KEYCHAIN_SERVICE_PREFIX}.{key_name}")
}

fn read_keychain_secret(key_name: &str) -> Result<Option<String>, String> {
    ensure_allowed_api_key(key_name)?;
    let output = Command::new("/usr/bin/security")
        .args([
            "find-generic-password",
            "-a",
            "agenthub",
            "-s",
            &keychain_service(key_name),
            "-w",
        ])
        .output()
        .map_err(|e| format!("无法读取 macOS 钥匙串: {e}"))?;
    if !output.status.success() {
        return Ok(None);
    }
    let value = String::from_utf8_lossy(&output.stdout).trim().to_string();
    Ok((!value.is_empty()).then_some(value))
}

#[tauri::command]
pub async fn save_api_key(key_name: String, value: String) -> Result<bool, String> {
    ensure_allowed_api_key(&key_name)?;
    let value = value.trim().to_string();
    if value.is_empty() {
        return Err("API 密钥不能为空".into());
    }
    tauri::async_runtime::spawn_blocking(move || {
        let service = keychain_service(&key_name);
        let mut child = Command::new("/usr/bin/security")
            .args([
                "add-generic-password",
                "-a",
                "agenthub",
                "-s",
                &service,
                "-U",
                "-w",
            ])
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .spawn()
            .map_err(|e| format!("无法写入 macOS 钥匙串: {e}"))?;
        if let Some(stdin) = child.stdin.as_mut() {
            stdin
                // `security -w` 最后置时会安全地从标准输入读取并要求确认两次。
                .write_all(format!("{value}\n{value}\n").as_bytes())
                .map_err(|e| format!("无法向钥匙串写入密钥: {e}"))?;
        }
        let output = child
            .wait_with_output()
            .map_err(|e| format!("等待钥匙串写入失败: {e}"))?;
        if output.status.success() {
            Ok(true)
        } else {
            Err(format!(
                "钥匙串写入失败: {}",
                String::from_utf8_lossy(&output.stderr).trim()
            ))
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn delete_api_key(key_name: String) -> Result<bool, String> {
    ensure_allowed_api_key(&key_name)?;
    tauri::async_runtime::spawn_blocking(move || {
        let output = Command::new("/usr/bin/security")
            .args([
                "delete-generic-password",
                "-a",
                "agenthub",
                "-s",
                &keychain_service(&key_name),
            ])
            .output()
            .map_err(|e| format!("无法删除钥匙串密钥: {e}"))?;
        Ok(output.status.success())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn api_key_status(keys: Vec<String>) -> Result<HashMap<String, bool>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let mut out = HashMap::new();
        for key in keys {
            ensure_allowed_api_key(&key)?;
            out.insert(key.clone(), read_keychain_secret(&key)?.is_some());
        }
        Ok(out)
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn run_agent_command(
    command: String,
    cwd: Option<String>,
    timeout_secs: Option<u64>,
    env_key: Option<String>,
) -> Result<CommandResult, String> {
    let t = timeout_secs.unwrap_or(300);
    tauri::async_runtime::spawn_blocking(move || {
        let mut env_vars = Vec::new();
        if let Some(name) = env_key {
            if let Some(secret) = read_keychain_secret(&name)? {
                env_vars.push((name, secret));
            }
        }
        Ok(run_with_timeout_env(&command, cwd.as_deref(), t, &env_vars))
    })
    .await
    .map_err(|e| e.to_string())?
}

fn curl_escape(value: &str) -> String {
    value
        .replace('\\', "\\\\")
        .replace('"', "\\\"")
        .replace('\n', "\\n")
        .replace('\r', "")
}

fn curl_json(
    method: &str,
    url: &str,
    headers: &[String],
    body: Option<&str>,
) -> Result<(u16, String), String> {
    let mut config = format!(
        "silent\nshow-error\nlocation\nmax-time = 60\nrequest = \"{}\"\nurl = \"{}\"\n",
        curl_escape(method),
        curl_escape(url)
    );
    for header in headers {
        config.push_str(&format!("header = \"{}\"\n", curl_escape(header)));
    }
    if let Some(body) = body {
        config.push_str(&format!("data = \"{}\"\n", curl_escape(body)));
    }
    config.push_str("write-out = \"\\n%{http_code}\"\n");

    let mut child = Command::new("/usr/bin/curl")
        .args(["--config", "-"])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("无法启动网络请求: {e}"))?;
    if let Some(stdin) = child.stdin.as_mut() {
        stdin
            .write_all(config.as_bytes())
            .map_err(|e| format!("无法发送网络请求: {e}"))?;
    }
    let output = child
        .wait_with_output()
        .map_err(|e| format!("等待网络请求失败: {e}"))?;
    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).trim().to_string());
    }
    let text = String::from_utf8_lossy(&output.stdout).to_string();
    let (body, status) = text
        .rsplit_once('\n')
        .ok_or_else(|| "服务返回格式异常".to_string())?;
    let status = status
        .trim()
        .parse::<u16>()
        .map_err(|_| "无法读取服务状态".to_string())?;
    Ok((status, body.to_string()))
}

fn provider_request(key_name: &str, secret: &str) -> Result<(String, Vec<String>), String> {
    let auth = format!("Authorization: Bearer {secret}");
    match key_name {
        "MOONSHOT_API_KEY" => Ok((
            "https://api.kimi.com/coding/v1/models".into(),
            vec![auth, "Content-Type: application/json".into()],
        )),
        "OPENAI_API_KEY" => Ok((
            "https://api.openai.com/v1/models".into(),
            vec![auth, "Content-Type: application/json".into()],
        )),
        "ANTHROPIC_API_KEY" => Ok((
            "https://api.anthropic.com/v1/models".into(),
            vec![
                format!("x-api-key: {secret}"),
                "anthropic-version: 2023-06-01".into(),
            ],
        )),
        "GEMINI_API_KEY" => Ok((
            "https://generativelanguage.googleapis.com/v1beta/models".into(),
            vec![format!("x-goog-api-key: {secret}")],
        )),
        "DASHSCOPE_API_KEY" => Ok((
            "https://dashscope.aliyuncs.com/compatible-mode/v1/models".into(),
            vec![auth, "Content-Type: application/json".into()],
        )),
        _ => Err("尚未配置该服务的模型接口".into()),
    }
}

fn list_models_sync(key_name: &str) -> Result<Vec<String>, String> {
    let secret = read_keychain_secret(key_name)?
        .ok_or_else(|| "请先将 API 密钥保存到 macOS 钥匙串".to_string())?;
    let (url, headers) = provider_request(key_name, &secret)?;
    let (status, body) = curl_json("GET", &url, &headers, None)?;
    if !(200..300).contains(&status) {
        return Err(format!(
            "模型服务返回 HTTP {status}: {}",
            body.chars().take(500).collect::<String>()
        ));
    }
    let json: serde_json::Value =
        serde_json::from_str(&body).map_err(|e| format!("无法解析模型列表: {e}"))?;
    let mut models: Vec<String> = if key_name == "GEMINI_API_KEY" {
        json.get("models")
            .and_then(|v| v.as_array())
            .into_iter()
            .flatten()
            .filter_map(|m| m.get("name").and_then(|v| v.as_str()))
            .map(|s| s.strip_prefix("models/").unwrap_or(s).to_string())
            .collect()
    } else {
        json.get("data")
            .and_then(|v| v.as_array())
            .into_iter()
            .flatten()
            .filter_map(|m| m.get("id").and_then(|v| v.as_str()))
            .map(ToString::to_string)
            .collect()
    };
    models.sort();
    models.dedup();
    if models.is_empty() {
        return Err("API 未返回可用模型".into());
    }
    Ok(models)
}

#[tauri::command]
pub async fn list_api_models(key_name: String) -> Result<Vec<String>, String> {
    ensure_allowed_api_key(&key_name)?;
    tauri::async_runtime::spawn_blocking(move || list_models_sync(&key_name))
        .await
        .map_err(|e| e.to_string())?
}

fn kimi_chat(secret: &str, model: &str, prompt: &str) -> Result<String, String> {
    let body = serde_json::json!({
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "max_tokens": 1024,
        "stream": false
    })
    .to_string();
    let headers = vec![
        format!("Authorization: Bearer {secret}"),
        "Content-Type: application/json".into(),
    ];
    let (status, response) = curl_json(
        "POST",
        "https://api.kimi.com/coding/v1/chat/completions",
        &headers,
        Some(&body),
    )?;
    if !(200..300).contains(&status) {
        return Err(format!(
            "Kimi API 返回 HTTP {status}: {}",
            response.chars().take(700).collect::<String>()
        ));
    }
    let json: serde_json::Value =
        serde_json::from_str(&response).map_err(|e| format!("无法解析 Kimi 回复: {e}"))?;
    json.pointer("/choices/0/message/content")
        .and_then(|v| v.as_str())
        .map(ToString::to_string)
        .ok_or_else(|| "Kimi API 没有返回文本内容".into())
}

#[tauri::command]
pub async fn validate_api_key(
    key_name: String,
    model: Option<String>,
) -> Result<ApiKeyValidation, String> {
    ensure_allowed_api_key(&key_name)?;
    tauri::async_runtime::spawn_blocking(move || {
        if key_name == "MOONSHOT_API_KEY" {
            let secret = read_keychain_secret(&key_name)?
                .ok_or_else(|| "请先保存 Kimi API 密钥".to_string())?;
            let model = model.unwrap_or_else(|| "kimi-for-coding".into());
            let reply = kimi_chat(&secret, &model, "仅回复 OK")?;
            Ok(ApiKeyValidation {
                ok: true,
                message: format!("连接成功，模型已回复：{}", reply.trim()),
                model: Some(model),
            })
        } else {
            let models = list_models_sync(&key_name)?;
            Ok(ApiKeyValidation {
                ok: true,
                message: format!("连接成功，读取到 {} 个模型", models.len()),
                model: None,
            })
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

#[tauri::command]
pub async fn run_api_prompt(
    key_name: String,
    model: String,
    prompt: String,
) -> Result<CommandResult, String> {
    ensure_allowed_api_key(&key_name)?;
    tauri::async_runtime::spawn_blocking(move || {
        if key_name != "MOONSHOT_API_KEY" {
            return Err("当前应用内直连对话仅支持 Kimi Code API".into());
        }
        let secret =
            read_keychain_secret(&key_name)?.ok_or_else(|| "请先保存 Kimi API 密钥".to_string())?;
        match kimi_chat(&secret, &model, &prompt) {
            Ok(text) => Ok(CommandResult {
                ok: true,
                code: 0,
                stdout: text,
                stderr: String::new(),
            }),
            Err(error) => Ok(CommandResult {
                ok: false,
                code: 1,
                stdout: String::new(),
                stderr: error,
            }),
        }
    })
    .await
    .map_err(|e| e.to_string())?
}

// ---------------- Kimi Code Web ----------------

static KIMI_WEB_CHILD: Mutex<Option<Child>> = Mutex::new(None);

fn extract_http_url(line: &str) -> Option<String> {
    let start = line.find("http://")?;
    let url: String = line[start..]
        .chars()
        .take_while(|c| !c.is_whitespace() && *c != '\u{1b}')
        .collect();
    (!url.is_empty()).then_some(url)
}

fn start_kimi_web() -> Result<String, String> {
    if let Ok(mut guard) = KIMI_WEB_CHILD.lock() {
        if let Some(mut child) = guard.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }

    let mut child = Command::new(shell())
        .args(["-l", "-c", &wrap("kimi web --no-open 2>&1")])
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|e| format!("无法启动 Kimi Code Web: {e}"))?;
    let stdout = child
        .stdout
        .take()
        .ok_or_else(|| "无法读取 Kimi Code Web 启动信息".to_string())?;
    let (tx, rx) = std::sync::mpsc::channel::<String>();
    std::thread::spawn(move || {
        for line in BufReader::new(stdout).lines().map_while(Result::ok) {
            let _ = tx.send(line);
        }
    });

    let deadline = Instant::now() + Duration::from_secs(25);
    while Instant::now() < deadline {
        if let Ok(line) = rx.recv_timeout(Duration::from_millis(250)) {
            if let Some(url) = extract_http_url(&line) {
                KIMI_WEB_CHILD
                    .lock()
                    .map_err(|e| e.to_string())?
                    .replace(child);
                return Ok(url);
            }
        }
        if let Ok(Some(status)) = child.try_wait() {
            return Err(format!("Kimi Code Web 启动失败，退出码 {status}"));
        }
    }
    let _ = child.kill();
    let _ = child.wait();
    Err("等待 Kimi Code Web 启动超时".into())
}

#[tauri::command]
pub async fn launch_kimi_web(app: tauri::AppHandle) -> Result<String, String> {
    let url = tauri::async_runtime::spawn_blocking(start_kimi_web)
        .await
        .map_err(|e| e.to_string())??;
    let parsed = tauri::Url::parse(&url).map_err(|e| format!("Kimi Code Web 地址无效: {e}"))?;
    if let Some(window) = app.get_webview_window("kimi-code-web") {
        window
            .navigate(parsed)
            .map_err(|e| format!("无法刷新 Kimi Code Web: {e}"))?;
        window.show().map_err(|e| e.to_string())?;
        window.set_focus().map_err(|e| e.to_string())?;
    } else {
        tauri::WebviewWindowBuilder::new(
            &app,
            "kimi-code-web",
            tauri::WebviewUrl::External(parsed),
        )
        .title("Kimi Code Web")
        .inner_size(1200.0, 820.0)
        .min_inner_size(900.0, 620.0)
        .build()
        .map_err(|e| format!("无法打开 Kimi Code Web 窗口: {e}"))?;
    }
    Ok("Kimi Code Web 已在 AgentHub 独立窗口中打开".into())
}

// ---------------- 防休眠 ----------------

static CAFFEINATE_PID: Mutex<Option<u32>> = Mutex::new(None);

#[tauri::command]
pub async fn set_keep_awake(enabled: bool) -> Result<bool, String> {
    let mut guard = CAFFEINATE_PID.lock().map_err(|e| e.to_string())?;
    if enabled {
        if guard.is_some() {
            return Ok(true);
        }
        let child = Command::new("caffeinate")
            .arg("-dimsu")
            .spawn()
            .map_err(|e| format!("caffeinate 启动失败: {e}"))?;
        *guard = Some(child.id());
        Ok(true)
    } else {
        if let Some(pid) = guard.take() {
            let _ = Command::new("kill").arg(pid.to_string()).output();
        }
        Ok(false)
    }
}

/// 获取系统环境信息
#[tauri::command]
pub async fn get_system_info() -> Result<serde_json::Value, String> {
    let mut info = serde_json::Map::new();

    for (key, cmd) in [
        ("node", "node --version"),
        ("npm", "npm --version"),
        ("python", "python3 --version"),
        ("uv", "uv --version"),
    ] {
        let c = cmd.to_string();
        if let Ok(Ok(output)) =
            tauri::async_runtime::spawn_blocking(move || run_via_login_shell(&c)).await
        {
            let version = if !output.stdout.is_empty() {
                String::from_utf8_lossy(&output.stdout).trim().to_string()
            } else {
                String::from_utf8_lossy(&output.stderr).trim().to_string()
            };
            if !version.is_empty() {
                info.insert(key.to_string(), serde_json::Value::String(version));
            }
        }
    }

    info.insert(
        "os".to_string(),
        serde_json::Value::String(std::env::consts::OS.to_string()),
    );
    info.insert(
        "arch".to_string(),
        serde_json::Value::String(std::env::consts::ARCH.to_string()),
    );

    Ok(serde_json::Value::Object(info))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn expands_home_directory_before_running_commands() {
        let expected = std::env::var("HOME").expect("HOME should be available in tests");
        assert_eq!(expand_home("~"), expected);
        assert_eq!(expand_home("~/workspace"), format!("{expected}/workspace"));

        let result = run_with_timeout("pwd", Some("~"), 5);
        assert!(result.ok, "pwd failed: {}", result.stderr);
        assert_eq!(result.stdout, expected);
    }

    #[test]
    fn extracts_kimi_web_url_without_trailing_text() {
        assert_eq!(
            extract_http_url("Kimi Web: http://127.0.0.1:58627/#token=abc ready"),
            Some("http://127.0.0.1:58627/#token=abc".into())
        );
        assert_eq!(extract_http_url("server starting"), None);
    }
}
