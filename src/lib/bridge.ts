import type { ApiKeyValidation, CliDetection, DesktopDetection, SystemInfo } from "../types/models";
import { BUILTIN_AGENTS } from "../data/agents";

/** 统一桥接层：Tauri 桌面端走真实命令，浏览器预览走本地模拟（localStorage 持久化） */

export interface CommandResult {
  ok: boolean;
  code: number;
  stdout: string;
  stderr: string;
}

const isTauri =
  typeof window !== "undefined" &&
  ("__TAURI_INTERNALS__" in window || "__TAURI__" in window);

export function runningInTauri() {
  return isTauri;
}

// ---------- 浏览器预览 Mock 状态 ----------
// Mock 注册表以 CLI 二进制名（agent.name）为键

const MOCK_KEY = "agenthub.mock.installed.v3";

type MockEntry = { version: string; path: string };

function binForAgent(agentId: string): string {
  return BUILTIN_AGENTS.find((a) => a.id === agentId)?.name || agentId;
}

function loadMockInstalled(): Record<string, MockEntry> {
  try {
    const raw = localStorage.getItem(MOCK_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore */
  }
  const seed: Record<string, MockEntry> = {
    claude: { version: "2.1.56 (Claude Code)", path: `${homeDir()}/.agenthub/npm-global/bin/claude` },
    gemini: { version: "0.18.4", path: `${homeDir()}/.agenthub/npm-global/bin/gemini` },
    codex: { version: "0.41.0", path: "/opt/homebrew/bin/codex" },
  };
  try {
    localStorage.setItem(MOCK_KEY, JSON.stringify(seed));
  } catch {
    /* ignore */
  }
  return seed;
}

function saveMockInstalled(map: Record<string, MockEntry>) {
  try {
    localStorage.setItem(MOCK_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

function homeDir() {
  return "/Users/demo";
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Mock：codex 模拟为 broken 状态，演示"已安装但异常"的检测 */
const MOCK_BROKEN: Record<string, string> = {
  codex: "Error: spawn /opt/homebrew/lib/node_modules/@openai/codex/vendor/aarch64-apple-darwin/codex/codex ENOENT",
};

// ---------- CLI 检测 ----------

export async function detectAllAgents(
  checks: { agentId: string; checkCommand?: string }[]
): Promise<CliDetection[]> {
  if (isTauri) {
    const { invoke } = await import("@tauri-apps/api/core");
    const pairs = checks
      .filter((c) => c.checkCommand)
      .map((c) => [c.agentId, c.checkCommand as string] as [string, string]);
    const results = await invoke<
      { agent_id: string; status: string; version?: string; path?: string; error?: string }[]
    >("detect_all_agents", { checks: pairs });
    return results.map((r) => ({
      agentId: r.agent_id,
      status: r.status as CliDetection["status"],
      version: r.version ?? undefined,
      path: r.path ?? undefined,
      error: r.error ?? undefined,
    }));
  }
  await delay(700);
  const mock = loadMockInstalled();
  return checks.map((c) => {
    const bin = binForAgent(c.agentId);
    const entry = mock[bin];
    if (!entry) return { agentId: c.agentId, status: "missing" as const };
    if (MOCK_BROKEN[bin]) {
      return { agentId: c.agentId, status: "broken" as const, path: entry.path, error: MOCK_BROKEN[bin] };
    }
    return { agentId: c.agentId, status: "installed" as const, version: entry.version, path: entry.path };
  });
}

// ---------- 桌面应用扫描 ----------

export async function detectDesktopApps(
  apps: { agentId: string; names: string[] }[]
): Promise<DesktopDetection[]> {
  if (isTauri) {
    const { invoke } = await import("@tauri-apps/api/core");
    const pairs = apps.map((a) => [a.agentId, a.names] as [string, string[]]);
    const results = await invoke<
      { agent_id: string; installed: boolean; version?: string; app_path?: string }[]
    >("detect_desktop_apps", { apps: pairs });
    return results.map((r) => ({
      agentId: r.agent_id,
      installed: r.installed,
      version: r.version ?? undefined,
      appPath: r.app_path ?? undefined,
    }));
  }
  await delay(400);
  // Mock：模拟 Claude.app 已安装
  return apps.map((a) => ({
    agentId: a.agentId,
    installed: a.names.includes("Claude.app") || a.names.includes("ChatGPT.app"),
    version: a.names.includes("Claude.app") ? "1.0.1213" : undefined,
    appPath: a.names.includes("Claude.app")
      ? "/Applications/Claude.app"
      : a.names.includes("ChatGPT.app")
        ? "/Applications/ChatGPT.app"
        : undefined,
  }));
}

// ---------- 登录态检测 ----------

export async function checkFilesExist(paths: string[]): Promise<boolean[]> {
  if (isTauri) {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<boolean[]>("check_files_exist", { paths });
  }
  await delay(200);
  // Mock：claude 已登录，其余未登录
  return paths.map((p) => p.includes(".claude"));
}

// ---------- 执行命令 ----------

export async function runCommand(
  command: string,
  cwd?: string,
  timeoutSecs = 120
): Promise<CommandResult> {
  if (isTauri) {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<CommandResult>("run_command", { command, cwd: cwd ?? null, timeoutSecs });
  }
  await delay(500);
  const mock = loadMockInstalled();
  const bin = command.trim().split(/\s+/)[0];
  if (/--version|-v|version/.test(command) && mock[bin]) {
    if (MOCK_BROKEN[bin]) return { ok: false, code: 1, stdout: "", stderr: MOCK_BROKEN[bin] };
    return { ok: true, code: 0, stdout: mock[bin].version, stderr: "" };
  }
  if (command.startsWith("which ")) {
    const b = command.slice(6).trim();
    return mock[b]
      ? { ok: true, code: 0, stdout: mock[b].path, stderr: "" }
      : { ok: false, code: 1, stdout: "", stderr: `${b} not found` };
  }
  return {
    ok: true,
    code: 0,
    stdout: `[浏览器预览模式] 命令未真实执行：\n$ ${cwd ? `cd ${cwd} && ` : ""}${command}\n\n在桌面端（Tauri）中，该命令会通过登录 shell 真实运行。`,
    stderr: "",
  };
}

export async function runAgentCommand(
  command: string,
  cwd?: string,
  timeoutSecs = 300,
  envKey?: string
): Promise<CommandResult> {
  if (isTauri) {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<CommandResult>("run_agent_command", {
      command,
      cwd: cwd ?? null,
      timeoutSecs,
      envKey: envKey ?? null,
    });
  }
  return runCommand(command, cwd, timeoutSecs);
}

// ---------- macOS 钥匙串 / API 模型 ----------

const mockKeyStatus: Record<string, boolean> = {};
const KIMI_MODELS = ["k3", "k3-256k", "kimi-for-coding", "kimi-for-coding-highspeed"];

export async function saveApiKey(keyName: string, value: string): Promise<boolean> {
  if (isTauri) {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<boolean>("save_api_key", { keyName, value });
  }
  mockKeyStatus[keyName] = Boolean(value.trim());
  return mockKeyStatus[keyName];
}

export async function deleteApiKey(keyName: string): Promise<boolean> {
  if (isTauri) {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<boolean>("delete_api_key", { keyName });
  }
  delete mockKeyStatus[keyName];
  return true;
}

export async function getApiKeyStatus(keys: string[]): Promise<Record<string, boolean>> {
  if (isTauri) {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<Record<string, boolean>>("api_key_status", { keys });
  }
  return Object.fromEntries(keys.map((key) => [key, Boolean(mockKeyStatus[key])]));
}

export async function listApiModels(keyName: string): Promise<string[]> {
  if (isTauri) {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<string[]>("list_api_models", { keyName });
  }
  await delay(250);
  return keyName === "MOONSHOT_API_KEY" ? KIMI_MODELS : [];
}

export async function validateApiKey(keyName: string, model?: string): Promise<ApiKeyValidation> {
  if (isTauri) {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<ApiKeyValidation>("validate_api_key", { keyName, model: model ?? null });
  }
  await delay(300);
  return { ok: true, message: "浏览器预览模式：连接验证已模拟", model };
}

export async function runApiPrompt(
  keyName: string,
  model: string,
  prompt: string
): Promise<CommandResult> {
  if (isTauri) {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<CommandResult>("run_api_prompt", { keyName, model, prompt });
  }
  await delay(500);
  return {
    ok: true,
    code: 0,
    stdout: `[浏览器预览模式] ${model} 已收到：${prompt}`,
    stderr: "",
  };
}

export async function launchKimiWeb(): Promise<string> {
  if (isTauri) {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<string>("launch_kimi_web");
  }
  return "浏览器预览模式无法启动本机 Kimi Code Web";
}

// ---------- 安装 / 卸载 / 修复 ----------

export async function installAgentCommand(command: string): Promise<CommandResult> {
  if (isTauri) {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<CommandResult>("run_command", { command, cwd: null, timeoutSecs: 600 });
  }
  await delay(1800);
  const mock = loadMockInstalled();
  const matched = BUILTIN_AGENTS.find(
    (a) => a.installCommand === command || a.repairCommand === command
  );
  const pkg = command.split(/\s+/).pop() || "";
  const bin = matched?.name || pkg.split("/").pop() || pkg;
  if (bin) {
    delete (mock as Record<string, unknown>)[bin];
    mock[bin] = { version: "1.0.0 (mock)", path: `${homeDir()}/.agenthub/npm-global/bin/${bin}` };
    saveMockInstalled(mock);
  }
  return { ok: true, code: 0, stdout: `[模拟] ${command} 执行完成`, stderr: "" };
}

export async function uninstallAgentCommand(command: string, bin: string): Promise<CommandResult> {
  if (isTauri) {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<CommandResult>("run_command", { command, cwd: null, timeoutSecs: 300 });
  }
  await delay(900);
  const mock = loadMockInstalled();
  delete mock[bin];
  saveMockInstalled(mock);
  return { ok: true, code: 0, stdout: `[模拟] ${command} 执行完成`, stderr: "" };
}

// ---------- 终端 / 桌面应用 / 防休眠 ----------

export async function launchInTerminal(command: string, cwd?: string): Promise<string> {
  if (isTauri) {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<string>("launch_agent_terminal", { command, cwd: cwd ?? null });
  }
  await delay(300);
  return `[浏览器预览模式] 无法打开系统终端。桌面端会在 Terminal.app 中启动：${command}`;
}

export async function openDesktopApp(appPath: string): Promise<string> {
  if (isTauri) {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<string>("open_desktop_app", { appPath });
  }
  await delay(200);
  return `[浏览器预览模式] 无法打开应用。桌面端将执行 open ${appPath}`;
}

export async function setKeepAwake(enabled: boolean): Promise<boolean> {
  if (isTauri) {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<boolean>("set_keep_awake", { enabled });
  }
  await delay(100);
  return enabled;
}

export async function pickFolder(): Promise<string | null> {
  if (isTauri) {
    const { open } = await import("@tauri-apps/plugin-dialog");
    const selected = await open({ directory: true, multiple: false, title: "选择项目目录" });
    return typeof selected === "string" ? selected : null;
  }
  const input = window.prompt("浏览器预览模式：请输入项目目录路径", "/Users/demo/Documents/project");
  return input || null;
}

// ---------- 系统信息 ----------

export async function getSystemInfo(): Promise<SystemInfo> {
  if (isTauri) {
    const { invoke } = await import("@tauri-apps/api/core");
    return invoke<SystemInfo>("get_system_info");
  }
  await delay(200);
  return {
    node: "v24.15.0 (mock)",
    npm: "11.x (mock)",
    python: "Python 3.13 (mock)",
    uv: "uv 0.9 (mock)",
    os: "browser-preview",
    arch: "arm64",
  };
}

export function resetMockState() {
  try {
    localStorage.removeItem(MOCK_KEY);
  } catch {
    /* ignore */
  }
}
