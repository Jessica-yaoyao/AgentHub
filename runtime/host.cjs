/* AgentHub local session host. No credentials cross the webview boundary. */
const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { spawn, execFileSync } = require("node:child_process");
const { randomUUID } = require("node:crypto");
const net = require("node:net");

const KEYS = {
  kimi: "MOONSHOT_API_KEY",
  openai: "OPENAI_API_KEY",
  anthropic: "ANTHROPIC_API_KEY",
  gemini: "GEMINI_API_KEY",
  dashscope: "DASHSCOPE_API_KEY",
};
const NATIVE = new Set(["kimi-code", "opencode", "aider", "openclaw"]);
const BINS = {
  "kimi-code": "kimi",
  codex: "codex",
  "claude-code": "claude",
  "pi-coding": "pi",
  "gemini-cli": "gemini",
  "qwen-code": "qwen",
  "cursor-agent": "cursor-agent",
  opencode: "opencode",
  aider: "aider",
  openclaw: "openclaw",
};
function lines(stream, fn) {
  let buf = "";
  stream.setEncoding("utf8");
  stream.on("data", (data) => {
    buf += data;
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i).replace(/\r$/, "");
      buf = buf.slice(i + 1);
      fn(line);
    }
  });
  stream.on("end", () => {
    if (buf) fn(buf);
  });
}
function jsonLine(stream, fn) {
  lines(stream, (l) => {
    try {
      fn(JSON.parse(l));
    } catch {}
  });
}
function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.on("error", reject);
    s.listen(0, "127.0.0.1", () => {
      const p = s.address().port;
      s.close(() => resolve(p));
    });
  });
}
function stopChild(child) {
  if (!child || child.exitCode !== null) return;
  try {
    process.kill(-child.pid, "SIGTERM");
  } catch {
    child.kill();
  }
  const t = setTimeout(() => {
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch {}
  }, 2000);
  t.unref();
}
class Host {
  constructor(dir, emit = () => {}) {
    this.dir = dir;
    this.emit = emit;
    this.live = new Map();
    this.pending = new Map();
    this.secrets = new Set();
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    this.file = path.join(dir, "sessions.json");
    try {
      this.saved = JSON.parse(fs.readFileSync(this.file, "utf8"));
    } catch {
      this.saved = {};
    }
    this.env = {
      ...process.env,
      PATH: [
        path.join(os.homedir(), ".local/bin"),
        path.join(os.homedir(), ".agenthub/npm-global/bin"),
        "/opt/homebrew/bin",
        "/usr/local/bin",
        process.env.PATH,
      ].join(":"),
    };
  }
  redact(text) {
    let s = String(text);
    for (const k of this.secrets) if (k) s = s.split(k).join("[已隐藏]");
    return s.replace(/sk-[\w-]{20,}/g, "[已隐藏]");
  }
  save() {
    const tmp = this.file + ".tmp";
    fs.writeFileSync(tmp, JSON.stringify(this.saved), { mode: 0o600 });
    fs.renameSync(tmp, this.file);
  }
  key(provider) {
    const name = KEYS[provider];
    if (!name) return;
    try {
      const s = execFileSync(
        "/usr/bin/security",
        [
          "find-generic-password",
          "-a",
          "agenthub",
          "-s",
          `com.agenthub.api-key.${name}`,
          "-w",
        ],
        { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] },
      ).trim();
      this.secrets.add(s);
      return s;
    } catch {
      return undefined;
    }
  }
  event(t, kind, data = {}) {
    this.emit({
      taskId: t.id,
      kind,
      ...JSON.parse(this.redact(JSON.stringify(data))),
    });
  }
  status(t, phase, detail = "") {
    if (t.phase === phase && t.detail === detail) return;
    t.phase = phase;
    t.detail = detail;
    this.event(t, "status", { phase, detail, startedAt: t.startedAt });
  }
  spawn(bin, args, env, cwd) {
    const c = spawn(bin, args, {
      cwd,
      env: { ...this.env, ...env },
      stdio: ["pipe", "pipe", "pipe"],
      detached: true,
    });
    c.on("error", () => {});
    return c;
  }
  async models(provider) {
    const key = this.key(provider);
    if (!key) throw Error("请先在设置中保存该服务的有效密钥");
    const urls = {
      kimi: "https://api.kimi.com/coding/v1/models",
      openai: "https://api.openai.com/v1/models",
      anthropic: "https://api.anthropic.com/v1/models",
      gemini: "https://generativelanguage.googleapis.com/v1beta/models",
      dashscope: "https://dashscope.aliyuncs.com/compatible-mode/v1/models",
    };
    const headers =
      provider === "anthropic"
        ? { "x-api-key": key, "anthropic-version": "2023-06-01" }
        : provider === "gemini"
          ? { "x-goog-api-key": key }
          : { Authorization: `Bearer ${key}` };
    const r = await fetch(urls[provider], {
      headers,
      signal: AbortSignal.timeout(20000),
    });
    if (!r.ok) throw Error(`模型服务返回 HTTP ${r.status}`);
    const j = await r.json();
    return [
      ...new Set(
        (j.data || j.models || []).map((m) =>
          (m.id || m.name || "").replace(/^models\//, ""),
        ),
      ),
    ]
      .filter(Boolean)
      .sort();
  }
  validate(p) {
    if (!p.taskId || !/^[\w-]{1,120}$/.test(p.taskId))
      throw Error("无效任务编号");
    if (!BINS[p.agentId]) throw Error("不支持的 Agent");
    const cwd =
      p.cwd === "~" ? os.homedir() : p.cwd?.replace(/^~\//, os.homedir() + "/");
    if (!cwd || !path.isAbsolute(cwd) || !fs.statSync(cwd).isDirectory())
      throw Error("请选择存在的项目目录");
    return cwd;
  }
  async prepare(p) {
    const cwd = this.validate(p);
    if (this.pending.has(p.taskId)) {
      const signature = [
        p.agentId,
        cwd,
        p.provider || "native",
        p.model || "",
      ].join("|");
      if (this.live.get(p.taskId)?.signature !== signature)
        throw Error("工作区正在连接，请连接完成后再切换模型");
      return this.pending.get(p.taskId);
    }
    const work = this._prepare({ ...p, cwd });
    this.pending.set(p.taskId, work);
    try {
      return await work;
    } finally {
      this.pending.delete(p.taskId);
    }
  }
  async _prepare(p) {
    let t = this.live.get(p.taskId);
    const signature = [
      p.agentId,
      p.cwd,
      p.provider || "native",
      p.model || "",
    ].join("|");
    if (t && t.signature !== signature) {
      if (t.agentId === "kimi-code") await this.pollKimi(t);
      if (t.busy) throw Error("请先停止当前任务，再切换模型或 Agent");
      t.closed = true;
      t.ws?.close();
      stopChild(t.child);
      clearInterval(t.poll);
      this.live.delete(p.taskId);
      t = null;
    }
    if (t?.child?.exitCode !== null && t?.child && !t.external) {
      clearInterval(t.poll);
      this.live.delete(p.taskId);
      t = null;
    }
    if (!t) {
      const saved = this.saved[p.taskId];
      t = {
        id: p.taskId,
        agentId: p.agentId,
        cwd: p.cwd,
        signature,
        provider: p.provider || "native",
        model: p.model,
        mode: p.mode || "plan",
        phase: "idle",
        busy: false,
        session:
          saved?.agentId === p.agentId && saved.cwd === p.cwd
            ? saved.session
            : undefined,
      };
      this.live.set(t.id, t);
      try {
        if (NATIVE.has(t.agentId)) await this.startNative(t);
        else if (t.agentId === "codex") await this.startCodex(t);
        else if (t.agentId === "pi-coding") await this.startPi(t);
      } catch (e) {
        stopChild(t.child);
        this.live.delete(t.id);
        throw e;
      }
    }
    return {
      native: NATIVE.has(t.agentId),
      url: t.url,
      sessionId: t.session,
      phase: t.phase,
      model: t.model,
    };
  }
  remember(t) {
    this.saved[t.id] = { agentId: t.agentId, cwd: t.cwd, session: t.session };
    this.save();
  }
  async api(t, route, body) {
    const r = await fetch(t.origin + route, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        Authorization: `Bearer ${t.token}`,
        "Content-Type": "application/json",
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
    });
    const j = await r.json();
    if (!r.ok || j.error || (j.code !== undefined && j.code !== 0))
      throw Error(
        this.redact(j.error?.message || j.msg || `Kimi 服务返回 ${r.status}`),
      );
    return j.data ?? j;
  }
  async startNative(t) {
    const port = await freePort();
    let args,
      env = {};
    if (t.agentId === "kimi-code") {
      const key = this.key("kimi");
      if (!key) throw Error("原生 Kimi 工作区需要在设置中保存 Kimi Code 密钥");
      const home = path.join(this.dir, "kimi", t.id);
      fs.mkdirSync(home, { recursive: true, mode: 0o700 });
      const config = path.join(home, "config.toml");
      if (!fs.existsSync(config))
        fs.writeFileSync(
          config,
          'default_plan_mode = true\ndefault_permission_mode = "manual"\ntelemetry = false\n',
          { mode: 0o600 },
        );
      env = {
        KIMI_CODE_HOME: home,
        KIMI_MODEL_NAME: t.model || "kimi-for-coding",
        KIMI_MODEL_API_KEY: key,
        KIMI_MODEL_BASE_URL: "https://api.kimi.com/coding/v1",
        KIMI_MODEL_PROVIDER_TYPE: "kimi",
        KIMI_MODEL_DISPLAY_NAME: t.model || "kimi-for-coding",
        KIMI_DISABLE_TELEMETRY: "1",
      };
      args = ["web", "--no-open", "--port", String(port)];
    } else if (t.agentId === "opencode") {
      args = ["web", "--hostname", "127.0.0.1", "--port", String(port)];
    } else if (t.agentId === "aider") {
      args = ["--browser", "--no-auto-commits"];
      env = {
        STREAMLIT_SERVER_ADDRESS: "127.0.0.1",
        STREAMLIT_SERVER_PORT: String(port),
        STREAMLIT_SERVER_HEADLESS: "true",
      };
    } else {
      const data = await new Promise((resolve, reject) => {
        const c = this.spawn("openclaw", ["dashboard", "--json"], {}, t.cwd);
        let out = "";
        const timer = setTimeout(() => {
          stopChild(c);
          reject(Error("OpenClaw 控制台连接超时"));
        }, 15000);
        c.stdout.on("data", (b) => (out += b));
        c.on("error", () => {
          clearTimeout(timer);
          reject(Error("未找到 OpenClaw"));
        });
        c.on("close", (code) => {
          clearTimeout(timer);
          try {
            const j = JSON.parse(out);
            if (code !== 0 || j.ok === false)
              throw Error(j.reason || "Gateway 尚未就绪");
            resolve(j);
          } catch (e) {
            reject(Error("OpenClaw 需要先完成 Gateway 配置：" + e.message));
          }
        });
      });
      const u = new URL(data.browserUrl || data.url);
      if (!["127.0.0.1", "localhost"].includes(u.hostname))
        throw Error("仅支持本机 Gateway，请使用官方客户端连接远程服务");
      t.url = u.toString();
      t.external = true;
      this.status(t, "idle", "已连接原有 Gateway，不启动外部消息通道");
      return;
    }
    t.child = this.spawn(BINS[t.agentId], args, env, t.cwd);
    let log = "";
    const ready = new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(Error("原生服务启动超时，请检查安装和配置")),
        25000,
      );
      const check = (line) => {
        log = (log + "\n" + line).slice(-3000);
        const url = line.match(
          /http:\/\/(?:127\.0\.0\.1|localhost):\d+[^\s\x1b]*/,
        )?.[0];
        if (url) {
          clearTimeout(timer);
          resolve(url);
        }
      };
      lines(t.child.stdout, check);
      lines(t.child.stderr, check);
      t.child.once("error", (e) => {
        clearTimeout(timer);
        reject(Error(`无法启动 ${BINS[t.agentId]}：${e.code}`));
      });
      t.child.once("exit", (code) => {
        clearTimeout(timer);
        reject(Error(`原生服务已退出 (${code})：${this.redact(log)}`));
      });
    });
    t.url = await ready;
    if (t.agentId === "kimi-code") {
      const u = new URL(t.url);
      t.origin = u.origin;
      t.token =
        u.searchParams.get("token") ||
        new URLSearchParams(u.hash.slice(1)).get("token");
      if (!t.token) {
        const home = env.KIMI_CODE_HOME;
        const candidates = ["server.token", "server-token", "server/token"];
        for (const f of candidates)
          try {
            t.token = fs.readFileSync(path.join(home, f), "utf8").trim();
            break;
          } catch {}
      }
      if (!t.token) throw Error("Kimi 未提供本地访问凭证，已拒绝无认证接入");
      this.secrets.add(t.token);
      await this.api(t, "/api/v1/meta");
      if (t.session) {
        try {
          await this.api(t, `/api/v1/sessions/${t.session}`);
        } catch {
          t.session = undefined;
        }
      }
      if (!t.session) {
        const s = await this.api(t, "/api/v1/sessions", {
          title: "AgentHub 工作会话",
          metadata: { cwd: t.cwd, agenthub_task: t.id },
        });
        t.session = s.id;
        this.remember(t);
      }
      await this.api(t, `/api/v1/sessions/${t.session}/profile`, {
        agent_config: {
          model: "__kimi_env_model__",
          plan_mode: t.mode === "plan",
          permission_mode: "manual",
        },
      });
      u.pathname = "/sessions/" + t.session;
      u.searchParams.set("kimi_onboarded", "1");
      t.url = u.toString();
      this.subscribeKimi(t);
      t.poll = setInterval(
        () =>
          this.pollKimi(t).catch((e) =>
            this.status(t, "error", this.redact(e.message)),
          ),
        3000,
      );
      t.poll.unref();
    }
    this.status(t, "idle", "原生工作区已连接");
  }
  subscribeKimi(t) {
    if (t.closed) return;
    const ws = new WebSocket(t.origin.replace("http:", "ws:") + "/api/v1/ws", [
      `kimi-code.bearer.${t.token}`,
    ]);
    t.ws = ws;
    ws.onopen = () =>
      ws.send(
        JSON.stringify({
          type: "subscribe",
          id: "agenthub",
          payload: { session_ids: [t.session] },
        }),
      );
    ws.onmessage = (e) => {
      let m;
      try {
        m = JSON.parse(e.data);
      } catch {
        return;
      }
      const p = m.payload || m;
      const type = p.type || m.type;
      if (type === "ping") {
        ws.send(JSON.stringify({ type: "pong", payload: { nonce: p.nonce } }));
        return;
      }
      if (type === "turn.started") {
        t.busy = true;
        t.startedAt = Date.now();
        this.status(t, "working", "正在处理");
      } else if (type === "thinking.delta") {
        this.status(t, "thinking", "Kimi 原生思考状态");
      } else if (type === "assistant.delta") {
        this.status(t, "working", "正在生成回答");
      } else if (type === "tool.call.started" || type === "tool.progress") {
        this.status(t, "tool", p.tool_name || p.name || "正在使用工具");
      } else if (
        type === "event.approval.requested" ||
        type === "event.question.requested"
      )
        this.status(t, "waiting", "请在原生窗口中确认或回答");
      else if (type === "turn.ended") {
        void this.pollKimi(t).catch(() => {});
      }
    };
    ws.onerror = () => {};
    ws.onclose = () => {
      if (!t.closed && t.child?.exitCode === null) {
        const timer = setTimeout(() => this.subscribeKimi(t), 2000);
        timer.unref();
      }
    };
  }
  async pollKimi(t) {
    if (t.polling || t.closed) return;
    t.polling = true;
    try {
      const s = await this.api(t, `/api/v1/sessions/${t.session}/status`);
      const x = await this.api(t, `/api/v1/sessions/${t.session}`);
      if (s.busy && !t.busy) t.startedAt = Date.now();
      t.busy = !!s.busy;
      const phase =
        x.pending_interaction === "approval" ||
        x.pending_interaction === "question"
          ? "waiting"
          : s.busy
            ? ["thinking", "tool"].includes(t.phase)
              ? t.phase
              : "working"
            : x.last_turn_reason === "failed"
              ? "error"
              : x.last_turn_reason === "cancelled"
                ? "cancelled"
                : "idle";
      if (phase !== t.phase)
        this.status(
          t,
          phase,
          phase === "waiting" ? "请在原生窗口中确认或回答" : "",
        );
      this.event(t, "nativeStatus", {
        mode: s.plan_mode ? "plan" : "execute",
        model: t.model,
        busy: t.busy,
        failed: x.last_turn_reason === "failed",
        title: x.last_prompt?.slice(0, 28),
        updatedAt: x.updated_at,
      });
    } finally {
      t.polling = false;
    }
  }
  rpc(t, method, params) {
    const id = ++t.serial;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        t.requests.delete(id);
        reject(Error(`${method} 等待响应超时`));
      }, 20000);
      t.requests.set(id, {
        resolve: (v) => {
          clearTimeout(timeout);
          resolve(v);
        },
        reject: (e) => {
          clearTimeout(timeout);
          reject(e);
        },
      });
      t.child.stdin.write(JSON.stringify({ id, method, params }) + "\n");
    });
  }
  setupRpc(t, onMessage) {
    t.serial = 0;
    t.requests = new Map();
    jsonLine(t.child.stdout, (m) => {
      if (
        m.id !== undefined &&
        t.requests.has(m.id) &&
        ("result" in m || "error" in m)
      ) {
        const r = t.requests.get(m.id);
        t.requests.delete(m.id);
        m.error ? r.reject(Error(m.error.message)) : r.resolve(m.result);
      } else onMessage(m);
    });
    lines(t.child.stderr, (l) => {
      t.stderr = this.redact(l).slice(-1000);
    });
    t.child.on("exit", () => {
      for (const r of t.requests.values())
        r.reject(Error(t.stderr || "Agent 进程已退出"));
      t.requests.clear();
      if (t.busy) {
        t.busy = false;
        this.status(t, "error", t.stderr || "Agent 进程意外退出");
      }
    });
  }
  async startCodex(t) {
    const args = ["app-server", "--stdio"];
    const env = {};
    if (t.provider === "kimi") {
      const key = this.key("kimi");
      if (!key) throw Error("请先保存 Kimi Code 密钥");
      env.KIMI_API_KEY = key;
      for (const c of [
        'model_provider="agenthub_kimi"',
        'model_providers.agenthub_kimi.name="Kimi Code"',
        'model_providers.agenthub_kimi.base_url="https://api.kimi.com/coding/v1"',
        'model_providers.agenthub_kimi.env_key="KIMI_API_KEY"',
        'model_providers.agenthub_kimi.wire_api="responses"',
      ])
        args.push("-c", c);
    } else if (t.provider !== "native") {
      const key = this.key(t.provider);
      if (t.provider !== "openai")
        throw Error("Codex 目前支持原有登录、OpenAI API 或 Kimi Code API");
      if (!key) throw Error("请先保存 OpenAI 密钥");
      env.OPENAI_API_KEY = key;
      for (const c of [
        'model_provider="agenthub_openai"',
        'model_providers.agenthub_openai.name="OpenAI API"',
        'model_providers.agenthub_openai.base_url="https://api.openai.com/v1"',
        'model_providers.agenthub_openai.env_key="OPENAI_API_KEY"',
        'model_providers.agenthub_openai.wire_api="responses"',
      ])
        args.push("-c", c);
    }
    t.child = this.spawn("codex", args, env, t.cwd);
    this.setupRpc(t, (m) => this.codexEvent(t, m));
    await this.rpc(t, "initialize", {
      clientInfo: { name: "agenthub", title: "AgentHub", version: "0.5.0" },
      capabilities: { experimentalApi: true },
    });
    t.child.stdin.write('{"method":"initialized"}\n');
    const params = {
      cwd: t.cwd,
      model: t.model || null,
      approvalPolicy: "never",
      sandbox: "read-only",
      experimentalRawEvents: false,
      persistExtendedHistory: true,
    };
    const r = t.session
      ? await this.rpc(t, "thread/resume", { ...params, threadId: t.session })
      : await this.rpc(t, "thread/start", params);
    t.session = r.thread.id;
    t.effectiveModel = r.model || t.model;
    this.remember(t);
    this.status(t, "idle");
  }
  codexEvent(t, m) {
    const p = m.params || {};
    if (p.threadId && p.threadId !== t.session) return;
    const name = m.method || "";
    if (m.id !== undefined && name.includes("requestApproval")) {
      t.approvals ??= new Map();
      t.approvals.set(String(m.id), m);
      this.event(t, "approval", {
        requestId: String(m.id),
        title: p.reason || p.command || "工具执行需要确认",
        detail: p,
      });
      this.status(t, "waiting", "等待你的授权");
      return;
    }
    if (m.id !== undefined && name === "item/tool/requestUserInput") {
      t.approvals ??= new Map();
      t.approvals.set(String(m.id), m);
      this.event(t, "question", {
        requestId: String(m.id),
        questions: p.questions,
      });
      this.status(t, "waiting", "等待你的回答");
      return;
    }
    if (name === "turn/started") {
      t.turn = p.turn.id;
      this.status(t, "working");
    }
    if (name === "item/agentMessage/delta")
      this.event(t, "text", { delta: p.delta });
    if (name.includes("reasoning") && name.endsWith("Delta"))
      this.status(t, "thinking", "正在思考");
    if (name === "item/started") {
      const i = p.item;
      if (i?.type === "reasoning") this.status(t, "thinking");
      else if (!["agentMessage", "userMessage"].includes(i?.type)) {
        this.status(t, "tool", i?.command || i?.type);
        this.event(t, "tool", { item: i });
      }
    }
    if (name === "item/completed" && p.item?.type !== "agentMessage")
      this.event(t, "tool", { item: p.item });
    if (name === "turn/plan/updated") this.event(t, "plan", { steps: p.plan });
    if (name === "turn/diff/updated") this.event(t, "diff", { diff: p.diff });
    if (name === "thread/tokenUsage/updated")
      this.event(t, "usage", { usage: p.tokenUsage });
    if (name === "turn/completed") {
      t.busy = false;
      const error = p.turn.error?.message;
      this.event(t, "complete", { ok: p.turn.status === "completed", error });
      this.status(
        t,
        p.turn.status === "completed"
          ? t.mode === "plan"
            ? "planReady"
            : "done"
          : p.turn.status === "interrupted"
            ? "cancelled"
            : "error",
        error || "",
      );
    }
    if (name === "error")
      this.event(t, "notice", { text: p.error?.message || "Agent 返回错误" });
  }
  async startPi(t) {
    const env = { PI_TELEMETRY: "0" };
    const args = [
      "--mode",
      "rpc",
      "--no-extensions",
      "--no-skills",
      "--no-prompt-templates",
      "--tools",
      t.mode === "plan"
        ? "read,grep,find,ls"
        : "read,grep,find,ls,bash,edit,write",
      "--session-dir",
      path.join(this.dir, "pi-sessions"),
    ];
    if (!t.session) {
      t.session = randomUUID();
      this.remember(t);
    }
    args.push("--session-id", t.session);
    if (t.provider === "kimi") {
      const k = this.key("kimi");
      if (!k) throw Error("请先保存 Kimi Code 密钥");
      env.KIMI_API_KEY = k;
      args.push(
        "--provider",
        "kimi-coding",
        "--model",
        t.model || "kimi-for-coding",
      );
    } else {
      if (t.provider !== "native") {
        const k = this.key(t.provider);
        if (!k) throw Error("请先保存所选服务的密钥");
        env[KEYS[t.provider]] = k;
        args.push("--provider", t.provider);
      }
      if (t.model) args.push("--model", t.model);
    }
    t.child = this.spawn("pi", args, env, t.cwd);
    t.piMode = t.mode;
    const child = t.child;
    let readyResolve, readyReject;
    const ready = new Promise((res, rej) => {
      readyResolve = res;
      readyReject = rej;
    });
    const timer = setTimeout(
      () => readyReject(Error("Pi 启动响应超时")),
      15000,
    );
    jsonLine(child.stdout, (m) => {
      if (t.child !== child) return;
      if (m.id === "agenthub-ready") {
        clearTimeout(timer);
        m.success ? readyResolve(m.data) : readyReject(Error(m.error));
        return;
      }
      if (m.type === "message_update") {
        const e = m.assistantMessageEvent || {};
        if (e.type === "text_delta") this.event(t, "text", { delta: e.delta });
        if (e.type === "thinking_delta") this.status(t, "thinking");
      }
      if (m.type === "tool_execution_start") {
        this.status(t, "tool", m.toolName);
        this.event(t, "tool", { item: m });
      }
      if (m.type === "tool_execution_end") this.event(t, "tool", { item: m });
      if (m.type === "agent_end") {
        t.busy = false;
        const err = m.messages?.find((x) => x.errorMessage)?.errorMessage;
        this.event(t, "complete", {
          ok: !err && !t.cancelled,
          error: t.cancelled ? "用户已停止" : err,
        });
        this.status(
          t,
          t.cancelled
            ? "cancelled"
            : err
              ? "error"
              : t.mode === "plan"
                ? "planReady"
                : "done",
          err || "",
        );
      }
      if (m.type === "response" && m.success === false) {
        t.busy = false;
        this.status(t, "error", m.error);
        this.event(t, "complete", { ok: false, error: m.error });
      }
    });
    lines(child.stderr, (l) => {
      t.stderr = this.redact(l).slice(-1000);
    });
    child.on("error", (e) => {
      clearTimeout(timer);
      readyReject(Error(`Pi 无法启动：${e.code}`));
    });
    child.on("exit", () => {
      clearTimeout(timer);
      readyReject(Error(t.stderr || "Pi 已退出"));
      if (t.child === child && t.busy) {
        t.busy = false;
        this.event(t, "complete", {
          ok: false,
          error: t.stderr || "Pi 已退出",
        });
        this.status(t, "error", t.stderr || "Pi 已退出");
      }
    });
    child.stdin.write('{"id":"agenthub-ready","type":"get_state"}\n');
    await ready;
  }
  async send(p) {
    await this.prepare(p);
    const t = this.live.get(p.taskId);
    if (t.busy) throw Error("此会话仍在运行，请等待或停止后再发送");
    t.mode = p.mode || "plan";
    t.cancelled = false;
    t.busy = true;
    t.startedAt = Date.now();
    this.status(t, "working", "正在连接 Agent");
    try {
      if (t.agentId === "kimi-code") {
        await this.api(t, `/api/v1/sessions/${t.session}/prompts`, {
          content: [{ type: "text", text: p.text }],
          model: "__kimi_env_model__",
          plan_mode: t.mode === "plan",
          permission_mode: "manual",
        });
        return { accepted: true };
      }
      if (t.agentId === "codex") {
        if (!t.effectiveModel) throw Error("无法确定当前模型，请先选择模型");
        const r = await this.rpc(t, "turn/start", {
          threadId: t.session,
          input: [{ type: "text", text: p.text }],
          model: t.model || undefined,
          approvalPolicy: t.mode === "plan" ? "never" : "on-request",
          sandboxPolicy:
            t.mode === "plan"
              ? { type: "readOnly" }
              : {
                  type: "workspaceWrite",
                  writableRoots: [t.cwd],
                  networkAccess: false,
                },
          collaborationMode: {
            mode: t.mode === "plan" ? "plan" : "default",
            settings: {
              model: t.effectiveModel,
              reasoning_effort: null,
              developer_instructions: null,
            },
          },
        });
        t.turn = r.turn.id;
        return { accepted: true };
      }
      if (t.agentId === "pi-coding") {
        if (t.piMode !== t.mode) {
          stopChild(t.child);
          await this.startPi(t);
          t.piMode = t.mode;
        }
        t.child.stdin.write(
          JSON.stringify({
            type: "prompt",
            message:
              t.mode === "plan"
                ? "先调研并给出计划，等待用户确认后执行。当前只允许读取。\n" +
                  p.text
                : p.text,
          }) + "\n",
        );
        return { accepted: true };
      }
      if (NATIVE.has(t.agentId)) throw Error("请在原生工作区中输入任务");
      if (t.agentId === "claude-code") {
        t.sdkRun = this.startClaude(t, p);
        return { accepted: true };
      }
      this.startStream(t, p);
      return { accepted: true };
    } catch (e) {
      t.busy = false;
      this.status(t, "error", this.redact(e.message));
      throw e;
    }
  }
  async startClaude(t, p) {
    let finishInput;
    const inputDone = new Promise((r) => (finishInput = r));
    t.cancelled = false;
    t.abort = new AbortController();
    try {
      const { query } = await import(
        process.env.AGENTHUB_CLAUDE_SDK || "@anthropic-ai/claude-agent-sdk"
      );
      const executable = this.env.PATH.split(":")
        .map((d) => path.join(d, "claude"))
        .find((f) => {
          try {
            fs.accessSync(f, fs.constants.X_OK);
            return true;
          } catch {
            return false;
          }
        });
      if (!executable) throw Error("未找到 Claude Code，请先完成安装");
      const env = {
        ...this.env,
        CLAUDE_AGENT_SDK_CLIENT_APP: "agenthub/0.5.0",
      };
      delete env.CLAUDECODE;
      if (t.provider !== "native") {
        const k = this.key(t.provider);
        if (!k) throw Error("请先保存所选服务的密钥");
        env.ANTHROPIC_API_KEY = k;
        delete env.ANTHROPIC_AUTH_TOKEN;
        env.ANTHROPIC_BASE_URL =
          t.provider === "kimi"
            ? "https://api.kimi.com/coding/"
            : "https://api.anthropic.com";
        for (const name of [
          "ANTHROPIC_MODEL",
          "ANTHROPIC_DEFAULT_OPUS_MODEL",
          "ANTHROPIC_DEFAULT_SONNET_MODEL",
          "ANTHROPIC_DEFAULT_HAIKU_MODEL",
          "CLAUDE_CODE_SUBAGENT_MODEL",
        ])
          env[name] = t.model;
      }
      const host = this;
      const canUseTool = async (name, input, { signal, toolUseID }) => {
        if (
          t.mode === "plan" &&
          ![
            "Read",
            "Glob",
            "Grep",
            "WebFetch",
            "WebSearch",
            "AskUserQuestion",
          ].includes(name)
        )
          return {
            behavior: "deny",
            message: "当前仅允许只读调研。请提交计划，等待用户在窗口确认执行。",
          };
        return new Promise((resolve) => {
          t.approvals ??= new Map();
          const id = toolUseID || randomUUID();
          const settle = (result) => {
            signal.removeEventListener("abort", abort);
            t.approvals.delete(id);
            host.event(t, "resolved", { requestId: id });
            resolve(result);
          };
          const abort = () =>
            settle({
              behavior: "deny",
              message: "用户已停止本次操作",
              interrupt: true,
            });
          t.approvals.set(id, { sdk: true, name, input, resolve: settle });
          signal.addEventListener("abort", abort, { once: true });
          if (signal.aborted) return abort();
          if (name === "AskUserQuestion")
            host.event(t, "question", {
              requestId: id,
              questions: input.questions.map((q, i) => ({
                ...q,
                id: String(i),
              })),
            });
          else
            host.event(t, "approval", {
              requestId: id,
              title: `${name} 需要你的确认`,
              detail: input,
            });
          host.status(t, "waiting", "等待你的确认");
        });
      };
      const prompt = (async function* () {
        yield {
          type: "user",
          message: { role: "user", content: p.text },
          parent_tool_use_id: null,
          session_id: t.session || "",
        };
        await inputDone;
      })();
      t.query = query({
        prompt,
        options: {
          cwd: t.cwd,
          env,
          model: t.model || undefined,
          resume: t.session || undefined,
          pathToClaudeCodeExecutable: executable,
          settingSources: [],
          includePartialMessages: true,
          abortController: t.abort,
          permissionMode: t.mode === "plan" ? "plan" : "default",
          tools:
            t.mode === "plan"
              ? [
                  "Read",
                  "Glob",
                  "Grep",
                  "WebFetch",
                  "WebSearch",
                  "AskUserQuestion",
                ]
              : undefined,
          canUseTool,
        },
      });
      let resultSeen = false,
        streamed = false;
      for await (const m of t.query) {
        if (m.session_id && m.session_id !== t.session) {
          t.session = m.session_id;
          this.remember(t);
        }
        const e = m.event;
        if (e?.type === "message_start") streamed = false;
        if (e?.delta?.type === "thinking_delta")
          this.status(t, "thinking", "正在思考");
        if (e?.delta?.type === "text_delta") {
          streamed = true;
          this.status(t, "working", "正在生成回答");
          this.event(t, "text", { delta: e.delta.text });
        }
        if (
          e?.type === "content_block_start" &&
          e.content_block?.type === "tool_use"
        ) {
          this.status(t, "tool", e.content_block.name);
          this.event(t, "tool", { item: e.content_block });
        }
        if (m.type === "assistant" && !streamed) {
          const text = m.message.content
            .filter((c) => c.type === "text")
            .map((c) => c.text)
            .join("");
          if (text) this.event(t, "text", { delta: text });
        }
        if (m.type === "tool_progress") this.event(t, "tool", { item: m });
        if (m.type === "result") {
          resultSeen = true;
          const error = m.is_error
            ? m.errors?.join("\n") || m.result || "Claude 执行失败"
            : undefined;
          t.busy = false;
          this.event(t, "complete", {
            ok: !m.is_error && !t.cancelled,
            error: t.cancelled ? "用户已停止" : error,
          });
          this.status(
            t,
            t.cancelled
              ? "cancelled"
              : m.is_error
                ? "error"
                : t.mode === "plan"
                  ? "planReady"
                  : "done",
            error || "",
          );
          break;
        }
      }
      if (!resultSeen && !t.cancelled) throw Error("Claude 未返回完成结果");
    } catch (e) {
      t.busy = false;
      this.event(t, "complete", {
        ok: false,
        error: t.cancelled ? "用户已停止" : e.message,
      });
      this.status(
        t,
        t.cancelled ? "cancelled" : "error",
        t.cancelled ? "已停止" : this.redact(e.message),
      );
    } finally {
      finishInput();
      t.query?.close();
      t.query = undefined;
      t.busy = false;
      for (const req of t.approvals?.values() || [])
        if (req.sdk) req.resolve({ behavior: "deny", message: "会话已结束" });
    }
  }
  startStream(t, p) {
    let args;
    const env = {};
    const key = t.provider !== "native" ? this.key(t.provider) : undefined;
    if (key) env[KEYS[t.provider]] = key;
    if (t.agentId === "claude-code") {
      args = [
        "-p",
        p.text,
        "--output-format",
        "stream-json",
        "--verbose",
        "--include-partial-messages",
        "--permission-mode",
        t.mode === "plan" ? "plan" : "default",
      ];
      if (t.session) args.push("--resume", t.session);
      if (t.mode === "plan")
        args.push("--tools", "Read,Glob,Grep,WebFetch,WebSearch");
      if (t.provider === "kimi") {
        env.ANTHROPIC_API_KEY = key;
        env.ANTHROPIC_BASE_URL = "https://api.kimi.com/coding/";
      }
    } else if (t.agentId === "gemini-cli" || t.agentId === "qwen-code") {
      args = [
        "-p",
        p.text,
        "--output-format",
        "stream-json",
        "--approval-mode",
        t.mode === "plan" ? "plan" : "default",
      ];
      if (t.session) args.push("--resume", t.session);
    } else if (t.agentId === "cursor-agent") {
      if (t.mode === "plan")
        throw Error(
          "当前 Cursor 接入尚未验证只读计划约束，请使用官方终端计划模式",
        );
      args = [
        "-p",
        p.text,
        "--output-format",
        "stream-json",
        "--stream-partial-output",
      ];
      if (t.session) args.push("--resume", t.session);
    } else throw Error("此 Agent 尚未提供可验证的窗口执行方式");
    if (t.model) args.push("--model", t.model);
    t.child = this.spawn(BINS[t.agentId], args, env, t.cwd);
    let resultError = "",
      hadText = false;
    jsonLine(t.child.stdout, (m) => {
      if (m.session_id) {
        t.session = m.session_id;
        this.remember(t);
      }
      const e = m.event || m;
      if (e.delta?.type === "thinking_delta") this.status(t, "thinking");
      const text =
        e.delta?.text ||
        (m.type === "message" && m.role === "assistant"
          ? m.content
          : undefined);
      if (typeof text === "string") {
        hadText = true;
        this.event(t, "text", { delta: text });
      }
      if (
        e.type === "content_block_start" &&
        e.content_block?.type === "tool_use"
      ) {
        this.status(t, "tool", e.content_block.name);
        this.event(t, "tool", { item: e.content_block });
      }
      if (
        m.type === "tool_use" ||
        m.type === "tool_result" ||
        m.type === "tool_call"
      )
        this.event(t, "tool", { item: m });
      if (m.type === "assistant" && !hadText) {
        const text = m.message?.content
          ?.filter((c) => c.type === "text")
          .map((c) => c.text)
          .join("");
        if (text) this.event(t, "text", { delta: text });
      }
      if (m.type === "result") {
        if (m.is_error) resultError = m.result || m.errors?.join("\n");
        if (m.permission_denials?.length)
          this.event(t, "notice", {
            text: "有操作被权限规则拦截。请在官方终端确认权限后继续。",
          });
        if (!hadText && typeof m.result === "string")
          this.event(t, "text", { delta: m.result });
      }
      if (m.type === "error")
        resultError = m.message || JSON.stringify(m.error);
    });
    lines(t.child.stderr, (l) => {
      t.stderr = this.redact(l).slice(-2000);
    });
    t.child.on("error", (e) => {
      resultError = `启动失败：${e.code}`;
    });
    t.child.on("close", (code) => {
      t.busy = false;
      const ok = code === 0 && !resultError;
      const error = ok
        ? undefined
        : resultError || t.stderr || `退出码 ${code}`;
      this.event(t, "complete", { ok, error });
      this.status(
        t,
        ok
          ? t.mode === "plan"
            ? "planReady"
            : "done"
          : t.cancelled
            ? "cancelled"
            : "error",
        error || "",
      );
    });
  }
  async stop(id) {
    const t = this.live.get(id);
    if (!t) return true;
    t.cancelled = true;
    if (t.agentId === "kimi-code")
      await this.api(t, `/api/v1/sessions/${t.session}:abort`, {});
    else if (t.agentId === "codex" && t.turn)
      await this.rpc(t, "turn/interrupt", {
        threadId: t.session,
        turnId: t.turn,
      });
    else if (t.agentId === "pi-coding")
      t.child.stdin.write('{"type":"abort"}\n');
    else if (t.agentId === "claude-code") {
      for (const req of t.approvals?.values() || [])
        if (req.sdk)
          req.resolve({
            behavior: "deny",
            message: "用户已停止本次操作",
            interrupt: true,
          });
      await t.query?.interrupt().catch(() => {});
      await t.sdkRun;
    } else stopChild(t.child);
    t.busy = false;
    this.status(t, "cancelled", "已停止");
    return true;
  }
  async approve(p) {
    const t = this.live.get(p.taskId);
    const req = t?.approvals?.get(p.requestId);
    if (!req) throw Error("该确认请求已失效");
    if (req.sdk) {
      const updatedInput =
        req.name === "AskUserQuestion"
          ? {
              ...req.input,
              answers: Object.fromEntries(
                req.input.questions.map((q, i) => [
                  q.question,
                  p.answers?.[String(i)]?.answers?.join(", ") || "",
                ]),
              ),
            }
          : req.input;
      req.resolve(
        p.allow
          ? { behavior: "allow", updatedInput }
          : { behavior: "deny", message: "用户拒绝本次操作" },
      );
      this.status(t, "working");
      return true;
    }
    let result;
    if (req.method === "item/tool/requestUserInput")
      result = { answers: p.answers || {} };
    else result = { decision: p.allow ? "accept" : "decline" };
    t.child.stdin.write(JSON.stringify({ id: req.id, result }) + "\n");
    t.approvals.delete(p.requestId);
    this.event(t, "resolved", { requestId: p.requestId });
    this.status(t, "working");
    return true;
  }
  async handle(method, p) {
    switch (method) {
      case "prepare":
        return this.prepare(p);
      case "send":
        return this.send(p);
      case "stop":
        return this.stop(p.taskId);
      case "approve":
        return this.approve(p);
      case "models":
        return this.models(p.provider);
      case "status":
        return [...this.live.values()].map((t) => ({
          taskId: t.id,
          phase: t.phase,
          busy: t.busy,
        }));
      default:
        throw Error("未知操作");
    }
  }
  async close() {
    for (const t of this.live.values()) {
      t.closed = true;
      if (t.query) {
        await this.stop(t.id);
      }
      t.query?.close();
      t.ws?.close();
      clearInterval(t.poll);
      stopChild(t.child);
    }
    this.live.clear();
  }
}
module.exports = { Host, lines, stopChild };
if (require.main === module) {
  const host = new Host(
    process.env.AGENTHUB_DATA ||
      path.join(os.homedir(), ".agenthub", "workspaces"),
    (e) => process.stdout.write(JSON.stringify({ event: e }) + "\n"),
  );
  jsonLine(process.stdin, (m) =>
    host
      .handle(m.method, m.params || {})
      .then((result) =>
        process.stdout.write(JSON.stringify({ id: m.id, result }) + "\n"),
      )
      .catch((e) =>
        process.stdout.write(
          JSON.stringify({ id: m.id, error: host.redact(e.message) }) + "\n",
        ),
      ),
  );
  const shutdown = () => {
    void host.close().finally(() => process.exit(0));
  };
  process.stdin.on("end", shutdown);
  process.on("SIGTERM", shutdown);
}
