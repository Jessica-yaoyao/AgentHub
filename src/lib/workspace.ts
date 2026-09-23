import { create } from "zustand";
import { runningInTauri } from "./bridge";

export type Phase =
  | "idle"
  | "working"
  | "thinking"
  | "tool"
  | "waiting"
  | "planReady"
  | "done"
  | "cancelled"
  | "error";
export interface WorkspaceState {
  phase: Phase;
  detail?: string;
  startedAt?: number;
  url?: string;
  sessionId?: string;
  currentText?: string;
  tools: unknown[];
  diff?: string;
  steps?: { step: string; status: string }[];
  approvals: Record<string, WorkspaceEvent>;
  model?: string;
}
export interface WorkspaceEvent {
  taskId: string;
  mode?: "plan" | "execute";
  busy?: boolean;
  failed?: boolean;
  updatedAt?: string;
  kind: string;
  phase?: Phase;
  detail?: string;
  startedAt?: number;
  delta?: string;
  item?: unknown;
  steps?: { step: string; status: string }[];
  diff?: string;
  requestId?: string;
  title?: string;
  questions?: {
    id: string;
    header: string;
    question: string;
    options?: { label: string; description: string }[];
  }[];
  ok?: boolean;
  error?: string;
  text?: string;
  model?: string;
}
const emptyState = (): WorkspaceState => ({
  phase: "idle",
  tools: [],
  approvals: {},
});
export const useWorkspaceStore = create<{
  states: Record<string, WorkspaceState>;
  apply: (e: WorkspaceEvent) => void;
  patch: (id: string, p: Partial<WorkspaceState>) => void;
}>((set) => ({
  states: {},
  patch: (id, p) =>
    set((s) => ({
      states: {
        ...s.states,
        [id]: { ...(s.states[id] || emptyState()), ...p },
      },
    })),
  apply: (e) =>
    set((s) => {
      const x: WorkspaceState = { ...(s.states[e.taskId] || emptyState()) };
      if (e.kind === "status") {
        x.phase = e.phase || "idle";
        x.detail = e.detail;
        x.startedAt = e.startedAt || x.startedAt;
      }
      if (e.kind === "text")
        x.currentText = (x.currentText || "") + (e.delta || "");
      if (e.kind === "tool") x.tools = [...x.tools, e.item].slice(-100);
      if (e.kind === "diff") x.diff = e.diff;
      if (e.kind === "plan") x.steps = e.steps;
      if (e.kind === "approval" || e.kind === "question")
        x.approvals = { ...x.approvals, [e.requestId!]: e };
      if (e.kind === "resolved") {
        x.approvals = { ...x.approvals };
        delete x.approvals[e.requestId!];
      }
      if (e.kind === "notice") x.detail = e.text;
      if (e.kind === "complete") x.approvals = {};
      if (e.kind === "complete" && !e.ok) {
        x.detail = e.error;
        x.phase = "error";
      }
      return { states: { ...s.states, [e.taskId]: x } };
    }),
}));
export const busy = (s?: WorkspaceState) =>
  !!s && ["working", "thinking", "tool", "waiting"].includes(s.phase);
export async function workspaceRequest<T = unknown>(
  method: string,
  params: unknown,
): Promise<T> {
  if (!runningInTauri())
    throw Error("浏览器仅供界面预览，请在 AgentHub 桌面应用中运行真实任务");
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>("workspace_request", { method, params });
}
export async function nativeView(
  url: string | undefined,
  rect: DOMRect | undefined,
  visible: boolean,
) {
  if (!runningInTauri()) return;
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("workspace_webview", {
    url: url || null,
    x: rect?.x || 0,
    y: rect?.y || 0,
    width: rect?.width || 1,
    height: rect?.height || 1,
    visible,
  });
}
export const NATIVE_AGENTS = new Set([
  "kimi-code",
  "opencode",
  "aider",
  "openclaw",
]);
export const PHASE_LABELS: Record<Phase, string> = {
  idle: "就绪",
  working: "正在处理",
  thinking: "正在思考",
  tool: "正在使用工具",
  waiting: "等待你确认",
  planReady: "计划已完成 · 等待确认",
  done: "已完成",
  cancelled: "已停止",
  error: "需要处理",
};
