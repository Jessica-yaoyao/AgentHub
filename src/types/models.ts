// ---------------- Agent ----------------

export type AgentCategory =
  | "coding"
  | "chat"
  | "creative"
  | "automation"
  | "research"
  | "custom";

export type CliStatus = "installed" | "broken" | "missing" | "checking";

export type AuthState = "logged-in" | "api-key" | "none" | "unknown";

export interface Agent {
  id: string;
  name: string; // CLI 二进制名
  displayName: string;
  description: string;
  category: AgentCategory;
  icon: string;
  color: string;
  installCommand?: string;
  uninstallCommand?: string;
  repairCommand?: string;
  checkCommand?: string;
  /** 非交互运行模板，{{prompt}} 会被替换 */
  runCommand?: string;
  promptMode?: "print" | "interactive";
  envKey?: string;
  /** 可从对应 API 读取并切换模型 */
  modelProvider?: "openai" | "anthropic" | "gemini" | "kimi" | "dashscope";
  defaultModel?: string;
  /** 是否提供 CLI 自带的本地 Web 界面 */
  nativeWeb?: boolean;
  /** 关联桌面客户端 App 名（用于桌面应用扫描） */
  desktopAppNames?: string[];
  /** 登录态判断文件（任一存在即视为已登录） */
  authFiles?: string[];
  website?: string;
  features: string[];
  tags: string[];
  apiKeyRequired?: boolean;
}

/** Agent 运行时状态（检测后填充） */
export interface AgentRuntime {
  cliStatus: CliStatus;
  cliVersion?: string;
  cliPath?: string;
  cliError?: string;
  desktopInstalled: boolean;
  desktopVersion?: string;
  desktopPath?: string;
  auth: AuthState;
}

// ---------------- 项目 / 任务 ----------------

/** 项目 = 工作目录 */
export interface Project {
  id: string;
  name: string;
  path: string;
  createdAt: string;
}

export type TaskMode = "plan" | "execute";
export type TaskStatus = "running" | "done" | "error";

/** 任务 = 一次 Agent 会话 */
export interface Task {
  id: string;
  projectId: string;
  agentId: string;
  title: string;
  mode: TaskMode;
  provider?: string;
  model?: string;
  theme?: 'dark' | 'light';
  status: TaskStatus;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: string;
  real?: boolean;
  durationMs?: number;
}

// ---------------- 自动化 ----------------

export type ScheduleKind = "daily" | "weekly" | "interval" | "idle";

export interface AutomationItem {
  id: string;
  name: string;
  agentId: string;
  projectId: string;
  prompt: string;
  schedule: {
    kind: ScheduleKind;
    time?: string; // "HH:MM"，daily/weekly 用
    weekday?: number; // 0-6，weekly 用
    minutes?: number; // interval 用
  };
  enabled: boolean;
  lastRunAt?: string;
  lastResult?: string;
  lastOk?: boolean;
  createdAt: string;
}

// ---------------- 检测 / 日志 / 系统 ----------------

export interface CliDetection {
  agentId: string;
  status: "installed" | "broken" | "missing";
  version?: string;
  path?: string;
  error?: string;
}

export interface DesktopDetection {
  agentId: string;
  installed: boolean;
  version?: string;
  appPath?: string;
}

export interface RunRecord {
  id: string;
  label: string;
  command: string;
  output: string;
  ok: boolean;
  startedAt: string;
  durationMs: number;
}

export interface SystemInfo {
  node?: string;
  npm?: string;
  python?: string;
  uv?: string;
  os?: string;
  arch?: string;
}

export interface ApiKeyValidation {
  ok: boolean;
  message: string;
  model?: string;
}

// ---------------- 导航 ----------------

export type View = "home" | "task" | "automation" | "market" | "settings";

export interface NavEntry {
  view: View;
  taskId?: string | null;
}
