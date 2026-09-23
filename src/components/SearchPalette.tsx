import { useEffect, useMemo, useRef, useState } from "react";
import { useAppStore } from "../store/appStore";
import { AgentIcon } from "../components/AgentIcon";
import { Search, FileText, Folder, CalendarClock, Store, Settings, PlusCircle } from "lucide-react";

/** ⌘K 搜索面板：任务 / 项目 / Agent / 命令 */
export function SearchPalette() {
  const {
    paletteOpen,
    setPaletteOpen,
    tasks,
    projects,
    agents,
    selectTask,
    setAgentDrawer,
    navigate,
    createTask,
  } = useAppStore();
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (paletteOpen) {
      setQuery("");
      setIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [paletteOpen]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    const items: { id: string; kind: string; label: string; sub?: string; action: () => void; icon: React.ReactNode }[] = [];
    if (!q) {
      items.push(
        { id: "cmd-new", kind: "命令", label: "新建任务", action: () => createTask(), icon: <PlusCircle className="w-4 h-4 text-text-muted" /> },
        { id: "cmd-auto", kind: "命令", label: "打开自动化", action: () => navigate("automation"), icon: <CalendarClock className="w-4 h-4 text-text-muted" /> },
        { id: "cmd-market", kind: "命令", label: "打开插件市场", action: () => navigate("market"), icon: <Store className="w-4 h-4 text-text-muted" /> },
        { id: "cmd-settings", kind: "命令", label: "打开设置", action: () => navigate("settings"), icon: <Settings className="w-4 h-4 text-text-muted" /> }
      );
      return items;
    }
    for (const t of tasks) {
      if (t.title.toLowerCase().includes(q) || t.messages.some((m) => m.content.toLowerCase().includes(q))) {
        items.push({
          id: `task-${t.id}`,
          kind: "任务",
          label: t.title,
          sub: `${t.messages.length} 条消息`,
          action: () => selectTask(t.id),
          icon: <FileText className="w-4 h-4 text-text-muted" />,
        });
      }
    }
    for (const p of projects) {
      if (p.name.toLowerCase().includes(q) || p.path.toLowerCase().includes(q)) {
        items.push({
          id: `proj-${p.id}`,
          kind: "项目",
          label: p.name,
          sub: p.path,
          action: () => createTask({ projectId: p.id }),
          icon: <Folder className="w-4 h-4 text-warning" />,
        });
      }
    }
    for (const a of agents) {
      if (`${a.displayName} ${a.name} ${a.description}`.toLowerCase().includes(q)) {
        items.push({
          id: `agent-${a.id}`,
          kind: "Agent",
          label: a.displayName,
          sub: a.description.slice(0, 40),
          action: () => setAgentDrawer(a.id),
          icon: <AgentIcon agent={a} size="sm" />,
        });
      }
    }
    return items.slice(0, 12);
  }, [query, tasks, projects, agents, selectTask, setAgentDrawer, navigate, createTask]);

  if (!paletteOpen) return null;

  const run = (i: number) => {
    const item = results[i];
    if (!item) return;
    setPaletteOpen(false);
    item.action();
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 z-50 flex items-start justify-center pt-[15vh]"
      onClick={() => setPaletteOpen(false)}
    >
      <div
        className="w-full max-w-lg bg-bg-secondary border border-border rounded-2xl shadow-2xl shadow-black/50 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 border-b border-border">
          <Search className="w-4 h-4 text-text-muted shrink-0" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setIndex(0);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") setPaletteOpen(false);
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setIndex((i) => Math.min(i + 1, results.length - 1));
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setIndex((i) => Math.max(i - 1, 0));
              }
              if (e.key === "Enter") run(index);
            }}
            placeholder="搜索任务、项目、Agent，或执行命令..."
            className="flex-1 bg-transparent py-3.5 text-sm outline-none placeholder:text-text-muted"
          />
          <kbd className="text-[10px] text-text-muted border border-border rounded px-1.5 py-0.5">ESC</kbd>
        </div>
        <div className="max-h-80 overflow-y-auto py-1.5">
          {results.length === 0 ? (
            <p className="text-xs text-text-muted text-center py-8">没有匹配的结果</p>
          ) : (
            results.map((item, i) => (
              <button
                key={item.id}
                onClick={() => run(i)}
                onMouseEnter={() => setIndex(i)}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                  i === index ? "bg-accent/10" : ""
                }`}
              >
                {item.icon}
                <span className="flex-1 min-w-0">
                  <span className="block text-sm text-text-primary truncate">{item.label}</span>
                  {item.sub && <span className="block text-[10px] text-text-muted truncate">{item.sub}</span>}
                </span>
                <span className="text-[10px] text-text-muted shrink-0">{item.kind}</span>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
