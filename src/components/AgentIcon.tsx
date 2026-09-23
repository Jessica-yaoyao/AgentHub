import type { Agent, AgentRuntime } from "../types/models";
import {
  Terminal,
  Code2,
  Command,
  Bot,
  MessageSquare,
  Sparkles,
  Zap,
  GitBranch,
  SquareTerminal,
  MousePointer2,
} from "lucide-react";

const iconMap: Record<
  string,
  React.ComponentType<{ className?: string; style?: React.CSSProperties }>
> = {
  Terminal,
  Code2,
  Command,
  Bot,
  MessageSquare,
  Sparkles,
  Zap,
  GitBranch,
  SquareTerminal,
  MousePointer2,
};
const brandIcons: Record<string, string> = {
  codex: "codex.png",
  "claude-code": "claude.png",
  "kimi-code": "kimi.ico",
  "pi-coding": "pi.svg",
  "gemini-cli": "gemini.png",
  "qwen-code": "qwen.png",
  "cursor-agent": "cursor.svg",
  opencode: "opencode.png",
  openclaw: "openclaw.svg",
};

export function AgentIcon({
  agent,
  size = "md",
}: {
  agent: Agent;
  size?: "sm" | "md" | "lg" | "xl";
}) {
  const Icon = iconMap[agent.icon] || Terminal;
  const box =
    size === "sm"
      ? "w-7 h-7 rounded-lg"
      : size === "lg"
        ? "w-11 h-11 rounded-xl"
        : size === "xl"
          ? "w-14 h-14 rounded-2xl"
          : "w-9 h-9 rounded-lg";
  const iconSize =
    size === "sm"
      ? "w-3.5 h-3.5"
      : size === "lg"
        ? "w-5 h-5"
        : size === "xl"
          ? "w-7 h-7"
          : "w-4 h-4";
  return (
    <div
      className={`${box} flex items-center justify-center shrink-0`}
      style={{
        backgroundColor:
          agent.id === "cursor-agent" ? "#eee" : `${agent.color}1f`,
      }}
    >
      {brandIcons[agent.id] ? (
        <img
          src={`/brands/${brandIcons[agent.id]}`}
          alt={`${agent.displayName} 官方标识`}
          className="w-[75%] h-[75%] object-contain rounded"
        />
      ) : agent.id === "aider" ? (
        <span
          className="font-mono font-bold text-xs"
          style={{ color: agent.color }}
        >
          ai
        </span>
      ) : (
        <Icon className={iconSize} style={{ color: agent.color }} />
      )}
    </div>
  );
}

/** Agent 综合状态点：CLI 可用 > 异常 > 仅桌面端 > 未安装 */
export function AgentStatusDot({ runtime }: { runtime?: AgentRuntime }) {
  const color = !runtime
    ? "bg-text-muted/50"
    : runtime.cliStatus === "installed"
      ? "bg-success"
      : runtime.cliStatus === "broken"
        ? "bg-warning"
        : runtime.desktopInstalled
          ? "bg-info"
          : runtime.cliStatus === "checking"
            ? "bg-warning animate-pulse"
            : "bg-text-muted/50";
  return <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${color}`} />;
}

export function runtimeLabel(runtime?: AgentRuntime): string {
  if (!runtime) return "未检测";
  if (runtime.cliStatus === "installed")
    return runtime.cliVersion?.split("\n")[0]?.slice(0, 30) || "已安装";
  if (runtime.cliStatus === "broken") return "异常";
  if (runtime.cliStatus === "checking") return "检测中";
  if (runtime.desktopInstalled) return "桌面客户端";
  return "未安装";
}

export const AUTH_LABELS: Record<string, { label: string; className: string }> =
  {
    "logged-in": {
      label: "检测到登录配置",
      className: "bg-success/10 text-success",
    },
    "api-key": { label: "Key 已配置", className: "bg-info/10 text-info" },
    none: { label: "未配置", className: "bg-warning/10 text-warning" },
    unknown: {
      label: "授权待确认",
      className: "bg-bg-tertiary text-text-muted",
    },
  };
