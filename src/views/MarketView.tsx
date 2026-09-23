import { useState } from "react";
import { useAppStore } from "../store/appStore";
import { CATEGORY_LABELS } from "../data/agents";
import type { Agent } from "../types/models";
import { AgentIcon, AgentStatusDot, runtimeLabel, AUTH_LABELS } from "../components/AgentIcon";
import { Search, RefreshCw, Download, Loader2, Wrench, AppWindow } from "lucide-react";

/** 插件市场：已安装图标条 + 分类卡片（ZCode 风格） */
export function MarketView() {
  const { agents, runtimes, refreshDetection, detecting, setAgentDrawer } = useAppStore();
  const [query, setQuery] = useState("");

  const installed = agents.filter(
    (a) => runtimes[a.id]?.cliStatus === "installed" || runtimes[a.id]?.desktopInstalled
  );
  const q = query.trim().toLowerCase();
  const categories = [...new Set(agents.map((a) => a.category))];

  const matches = (a: Agent) =>
    !q || `${a.displayName} ${a.name} ${a.description} ${a.tags.join(" ")}`.toLowerCase().includes(q);

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-4xl mx-auto">
        {/* 头部 */}
        <div className="flex items-start justify-between mb-1">
          <div>
            <h1 className="text-lg font-bold">插件市场</h1>
            <p className="text-xs text-text-secondary mt-0.5">
              安装与管理本机 AI Agent，CLI 与桌面客户端统一检测
            </p>
          </div>
          <button
            onClick={() => void refreshDetection()}
            disabled={detecting}
            className="flex items-center gap-1.5 text-xs text-text-secondary hover:text-text-primary bg-bg-card border border-border px-3 py-2 rounded-lg transition-colors disabled:opacity-50"
          >
            {detecting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
            刷新
          </button>
        </div>

        {/* 搜索 */}
        <div className="relative my-4">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-text-muted" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="搜索插件"
            className="w-full bg-bg-card border border-border rounded-xl pl-10 pr-4 py-2.5 text-sm outline-none focus:border-accent placeholder:text-text-muted"
          />
        </div>

        {/* 已安装图标条 */}
        <div className="mb-6">
          <h2 className="text-sm font-semibold mb-3">已安装</h2>
          {installed.length === 0 ? (
            <p className="text-xs text-text-muted">暂无已安装 Agent</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {installed.map((a) => (
                <button
                  key={a.id}
                  onClick={() => setAgentDrawer(a.id)}
                  title={`${a.displayName} · ${runtimeLabel(runtimes[a.id])}`}
                  className="relative group"
                >
                  <AgentIcon agent={a} size="lg" />
                  <span className="absolute -bottom-0.5 -right-0.5">
                    <AgentStatusDot runtime={runtimes[a.id]} />
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* 分类卡片 */}
        {categories.map((cat) => {
          const list = agents.filter((a) => a.category === cat && matches(a));
          if (list.length === 0) return null;
          return (
            <section key={cat} className="mb-6">
              <h2 className="text-sm font-semibold mb-3">{CATEGORY_LABELS[cat] || cat}</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {list.map((a) => (
                  <MarketCard key={a.id} agent={a} />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function MarketCard({ agent }: { agent: Agent }) {
  const { runtimes, installAgent, repairAgent, setAgentDrawer } = useAppStore();
  const rt = runtimes[agent.id];
  const cliOk = rt?.cliStatus === "installed";
  const broken = rt?.cliStatus === "broken";
  const checking = rt?.cliStatus === "checking";
  const authInfo = AUTH_LABELS[rt?.auth ?? "unknown"];

  return (
    <div
      onClick={() => setAgentDrawer(agent.id)}
      className="bg-bg-card border border-border hover:border-border-hover rounded-xl p-4 cursor-pointer transition-colors"
    >
      <div className="flex items-start gap-3">
        <AgentIcon agent={agent} size="lg" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold truncate">{agent.displayName}</h3>
            {rt?.desktopInstalled && (
              <span className="flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded bg-info/10 text-info shrink-0">
                <AppWindow className="w-2.5 h-2.5" />
                桌面端
              </span>
            )}
            {cliOk && (
              <span className={`text-[9px] px-1.5 py-0.5 rounded shrink-0 ${authInfo.className}`}>
                {authInfo.label}
              </span>
            )}
          </div>
          <p className="text-[11px] text-text-muted line-clamp-2 mt-1 leading-relaxed">
            {agent.description}
          </p>
        </div>

        {/* 操作按钮 */}
        <div onClick={(e) => e.stopPropagation()} className="shrink-0">
          {checking ? (
            <span className="flex items-center gap-1.5 text-[11px] text-text-muted px-2 py-1.5">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            </span>
          ) : cliOk ? (
            <span className="text-[10px] text-success px-2 py-1.5">已安装</span>
          ) : broken ? (
            <button
              onClick={() => void repairAgent(agent.id)}
              className="flex items-center gap-1 text-[11px] bg-warning/10 text-warning hover:bg-warning/20 px-2.5 py-1.5 rounded-lg transition-colors"
              title={rt?.cliError}
            >
              <Wrench className="w-3 h-3" />
              修复
            </button>
          ) : (
            <button
              onClick={() => void installAgent(agent.id)}
              className="flex items-center gap-1 text-[11px] bg-bg-tertiary border border-border text-text-secondary hover:text-text-primary hover:border-border-hover px-2.5 py-1.5 rounded-lg transition-colors"
            >
              <Download className="w-3 h-3" />
              安装
            </button>
          )}
        </div>
      </div>
      {broken && rt?.cliError && (
        <p className="mt-2 text-[10px] font-mono text-warning/80 bg-warning/5 rounded-lg px-2.5 py-1.5 truncate">
          {rt.cliError}
        </p>
      )}
    </div>
  );
}
