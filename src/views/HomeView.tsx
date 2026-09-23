import { useState } from "react";
import { useAppStore } from "../store/appStore";
import { InputCard } from "../components/InputCard";
import { QUICK_ACTIONS } from "../data/agents";
import { AgentIcon } from "../components/AgentIcon";
import { CalendarRange, Wrench, Presentation, MoonStar, Rocket, Settings2, X } from "lucide-react";

const chipIcons: Record<string, typeof CalendarRange> = {
  CalendarRange,
  Wrench,
  Presentation,
  MoonStar,
};

/** 首页：问候 + 状态横幅 + 大输入卡 + 快捷操作（ZCode 风格） */
export function HomeView() {
  const {
    agents,
    runtimes,
    createTask,
    sendTaskMessage,
    navigate,
    projects,
  } = useAppStore();

  const hour = new Date().getHours();
  const greeting =
    hour < 6 ? "夜深了，注意休息" : hour < 12 ? "早上好呀" : hour < 18 ? "下午好呀" : "晚上好呀，今天辛苦啦";

  const usable = agents.filter((a) => runtimes[a.id]?.cliStatus === "installed");
  const broken = agents.filter((a) => runtimes[a.id]?.cliStatus === "broken");
  const noneUsable = usable.length === 0;

  const runQuickAction = async (prompt: string) => {
    const id = createTask({ mode: "execute" });
    await sendTaskMessage(id, prompt);
  };

  return (
    <div className="h-full overflow-y-auto">
      <div className="min-h-full flex flex-col items-center justify-center px-8 py-10 max-w-3xl mx-auto w-full">
        {/* 品牌 + 问候 */}
        <h1 className="text-2xl font-bold mb-8 text-center">{greeting}</h1>

        {/* 状态横幅 */}
        {noneUsable ? (
          <Banner
            tone="warning"
            text="当前没有可用的 Agent CLI。请前往插件市场安装，或完成检测与配置。"
            actionLabel="去安装"
            onAction={() => navigate("market")}
          />
        ) : broken.length > 0 ? (
          <Banner
            tone="error"
            text={`${broken.map((a) => a.displayName).join("、")} 已安装但运行异常，可在插件市场中修复。`}
            actionLabel="查看"
            onAction={() => navigate("market")}
          />
        ) : null}

        {/* 大输入卡片 */}
        <InputCard autoFocus />

        {/* 快捷操作 */}
        <div className="flex flex-wrap items-center justify-center gap-2.5 mt-6">
          {QUICK_ACTIONS.map((chip) => {
            const Icon = chipIcons[chip.icon] || CalendarRange;
            if (chip.id === "idle-task") {
              return (
                <button
                  key={chip.id}
                  onClick={() => navigate("automation")}
                  className="flex items-center gap-1.5 text-xs text-text-secondary hover:text-text-primary bg-bg-card border border-border hover:border-border-hover px-3.5 py-2 rounded-full transition-colors"
                >
                  <Icon className="w-3.5 h-3.5" />
                  {chip.label}
                </button>
              );
            }
            return (
              <button
                key={chip.id}
                onClick={() => void runQuickAction(chip.prompt)}
                className="flex items-center gap-1.5 text-xs text-text-secondary hover:text-text-primary bg-bg-card border border-border hover:border-border-hover px-3.5 py-2 rounded-full transition-colors"
                title={chip.prompt}
              >
                <Icon className="w-3.5 h-3.5" />
                {chip.label}
              </button>
            );
          })}
        </div>

        {/* 可用 Agent 速览 */}
        {usable.length > 0 && (
          <div className="flex items-center gap-2 mt-8">
            <Rocket className="w-3.5 h-3.5 text-text-muted" />
            <span className="text-[11px] text-text-muted">已就绪：</span>
            {usable.slice(0, 6).map((a) => (
              <span
                key={a.id}
                className="flex items-center gap-1.5 text-[11px] text-text-secondary bg-bg-card border border-border px-2 py-1 rounded-full"
              >
                <AgentIcon agent={a} size="sm" />
                {a.displayName}
              </span>
            ))}
          </div>
        )}

        {projects.length === 0 && (
          <p className="text-[11px] text-text-muted mt-6 flex items-center gap-1.5">
            <Settings2 className="w-3.5 h-3.5" />
            提示：先在左侧添加项目目录，任务将在该目录下执行
          </p>
        )}
      </div>
    </div>
  );
}

function Banner({
  tone,
  text,
  actionLabel,
  onAction,
}: {
  tone: "warning" | "error";
  text: string;
  actionLabel: string;
  onAction: () => void;
}) {
  const [closed, setClosed] = useState(false);
  if (closed) return null;
  return (
    <div
      className={`w-full flex items-center gap-3 text-xs rounded-xl border px-4 py-3 mb-5 ${
        tone === "warning"
          ? "border-warning/30 bg-warning/5 text-warning"
          : "border-danger/30 bg-danger/5 text-danger"
      }`}
    >
      <span className="flex-1">{text}</span>
      <button
        onClick={onAction}
        className="px-3 py-1 rounded-lg bg-bg-card border border-border text-text-primary hover:bg-bg-hover transition-colors"
      >
        {actionLabel}
      </button>
      <button onClick={() => setClosed(true)} className="text-text-muted hover:text-text-primary">
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
