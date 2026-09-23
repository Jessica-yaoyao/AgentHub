import { useState } from "react";
import { useAppStore } from "../store/appStore";
import { AgentIcon, AgentStatusDot } from "./AgentIcon";
import {
  PlusCircle,
  Search,
  CalendarClock,
  Store,
  Folder,
  FolderOpen,
  Plus,
  Settings,
  KeyRound,
  Trash2,
  ChevronRight,
  ChevronDown,
  Zap,
} from "lucide-react";

/** ZCode 风格一级侧边栏 */
export function Sidebar() {
  const {
    view,
    navigate,
    createTask,
    setPaletteOpen,
    sidebarCollapsed,
    sidebarTab,
    setSidebarTab,
    projects,
    tasks,
    agents,
    runtimes,
    selectedTaskId,
    selectTask,
    removeTask,
    addProject,
    setSettingsAnchor,
  } = useAppStore();

  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  if (sidebarCollapsed) return null;

  const menuItems = [
    { id: "new-task", label: "新建任务", icon: PlusCircle, kbd: "⌘N", onClick: () => createTask() },
    { id: "search", label: "搜索", icon: Search, kbd: "⌘K", onClick: () => setPaletteOpen(true) },
    { id: "automation", label: "自动化", icon: CalendarClock, active: view === "automation", onClick: () => navigate("automation") },
    { id: "market", label: "插件市场", icon: Store, active: view === "market", onClick: () => navigate("market") },
  ];

  const renderTask = (t: (typeof tasks)[0], indent = false) => {
    const agent = agents.find((a) => a.id === t.agentId);
    const active = selectedTaskId === t.id && view === "task";
    return (
      <div
        key={t.id}
        onClick={() => selectTask(t.id)}
        className={`group flex items-center gap-2 px-2.5 py-1.5 rounded-lg cursor-pointer transition-colors ${
          indent ? "ml-4" : ""
        } ${active ? "bg-bg-hover" : "hover:bg-bg-hover/60"}`}
      >
        {agent ? (
          <AgentIcon agent={agent} size="sm" />
        ) : (
          <div className="w-7 h-7 rounded-lg bg-bg-tertiary" />
        )}
        <div className="flex-1 min-w-0">
          <p className={`text-xs truncate ${active ? "text-text-primary font-medium" : "text-text-secondary"}`}>
            {t.title}
          </p>
          <p className="text-[10px] text-text-muted truncate">
            {t.messages.length} 条消息 · {relativeTime(t.updatedAt)}
          </p>
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            removeTask(t.id);
          }}
          className="opacity-0 group-hover:opacity-100 p-1 rounded text-text-muted hover:text-danger transition-all"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
    );
  };

  return (
    <aside className="w-60 bg-bg-secondary border-r border-border flex flex-col shrink-0 select-none">
      {/* Logo */}
      <div className="h-12 flex items-center px-4 gap-2.5 shrink-0">
        <div className="w-6 h-6 rounded-md bg-accent flex items-center justify-center">
          <Zap className="w-3.5 h-3.5 text-white" />
        </div>
        <span className="font-bold text-sm">AgentHub</span>
      </div>

      {/* 命令面板 */}
      <div className="px-2 space-y-0.5 pb-3 border-b border-border">
        {menuItems.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={item.onClick}
              className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-[13px] transition-colors ${
                item.active
                  ? "bg-bg-hover text-text-primary font-medium"
                  : "text-text-secondary hover:text-text-primary hover:bg-bg-hover/60"
              }`}
            >
              <Icon className="w-4 h-4 text-text-muted" />
              <span className="flex-1 text-left">{item.label}</span>
              {item.kbd && (
                <kbd className="text-[10px] text-text-muted font-sans">{item.kbd}</kbd>
              )}
            </button>
          );
        })}
      </div>

      {/* 视图切换 */}
      <div className="flex items-center gap-1 px-3 pt-3 pb-1">
        <div className="flex bg-bg-tertiary rounded-md p-0.5">
          {(["group", "project"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setSidebarTab(tab)}
              className={`px-2.5 py-1 rounded text-[11px] transition-colors ${
                sidebarTab === tab
                  ? "bg-bg-hover text-text-primary"
                  : "text-text-muted hover:text-text-secondary"
              }`}
            >
              {tab === "group" ? "# 分组" : "项目"}
            </button>
          ))}
        </div>
      </div>

      {/* 项目 / 任务 列表 */}
      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {sidebarTab === "project" ? (
          <>
            <div className="flex items-center justify-between px-1.5 py-1.5">
              <span className="text-[11px] text-text-muted">项目</span>
              <button
                onClick={() => void addProject()}
                className="p-1 rounded text-text-muted hover:text-text-primary hover:bg-bg-hover transition-colors"
                title="添加项目"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>
            {projects.length === 0 && (
              <p className="px-1.5 py-2 text-[11px] text-text-muted">
                还没有项目，点击 + 添加工作目录
              </p>
            )}
            {projects.map((p) => {
              const projectTasks = tasks.filter((t) => t.projectId === p.id);
              const isOpen = expanded[p.id] ?? true;
              return (
                <div key={p.id}>
                  <button
                    onClick={() => setExpanded((e) => ({ ...e, [p.id]: !isOpen }))}
                    className="w-full flex items-center gap-1.5 px-1.5 py-1.5 rounded-lg hover:bg-bg-hover/60 transition-colors"
                  >
                    {isOpen ? (
                      <ChevronDown className="w-3 h-3 text-text-muted shrink-0" />
                    ) : (
                      <ChevronRight className="w-3 h-3 text-text-muted shrink-0" />
                    )}
                    {isOpen ? (
                      <FolderOpen className="w-3.5 h-3.5 text-warning shrink-0" />
                    ) : (
                      <Folder className="w-3.5 h-3.5 text-warning shrink-0" />
                    )}
                    <span className="text-xs text-text-secondary truncate">{p.name}</span>
                    <span className="ml-auto text-[10px] text-text-muted">{projectTasks.length || ""}</span>
                  </button>
                  {isOpen && projectTasks.map((t) => renderTask(t, true))}
                </div>
              );
            })}
          </>
        ) : (
          <>
            <p className="px-1.5 py-1.5 text-[11px] text-text-muted">按 Agent 分组</p>
            {agents
              .map((agent) => ({ agent, tasks: tasks.filter((t) => t.agentId === agent.id) }))
              .filter((g) => g.tasks.length > 0)
              .map((g) => (
                <div key={g.agent.id} className="mb-1">
                  <div className="flex items-center gap-2 px-1.5 py-1.5">
                    <AgentIcon agent={g.agent} size="sm" />
                    <span className="text-xs text-text-secondary">{g.agent.displayName}</span>
                    <span className="ml-auto text-[10px] text-text-muted">{g.tasks.length}</span>
                  </div>
                  {g.tasks.map((t) => renderTask(t, true))}
                </div>
              ))}
            {tasks.length === 0 && (
              <p className="px-1.5 py-2 text-[11px] text-text-muted">还没有任务</p>
            )}
          </>
        )}

        {/* 任务 section（项目视图下也展示未分组任务） */}
        <div className="flex items-center justify-between px-1.5 py-1.5 mt-2 border-t border-border">
          <span className="text-[11px] text-text-muted">任务</span>
          <button
            onClick={() => createTask()}
            className="p-1 rounded text-text-muted hover:text-text-primary hover:bg-bg-hover transition-colors"
            title="新建任务"
          >
            <Plus className="w-3.5 h-3.5" />
          </button>
        </div>
        {tasks.length === 0 ? (
          <p className="px-1.5 py-2 text-[11px] text-text-muted">还没有任务</p>
        ) : (
          tasks.slice(0, 8).map((t) => renderTask(t))
        )}
      </div>

      {/* 底部：账户 + 设置 */}
      <div className="border-t border-border p-2 flex items-center gap-1">
        <button
          onClick={() => {
            setSettingsAnchor("apikeys");
            navigate("settings");
          }}
          className="flex-1 flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-bg-hover/60 transition-colors"
        >
          <div className="w-6 h-6 rounded-full bg-accent/20 flex items-center justify-center">
            <KeyRound className="w-3 h-3 text-accent-light" />
          </div>
          <div className="text-left min-w-0">
            <p className="text-[11px] text-text-primary leading-tight">API 配置</p>
            <p className="text-[9px] text-text-muted leading-tight">
              {agents.filter((a) => runtimes[a.id]?.cliStatus === "installed").length} 个 Agent 可用
            </p>
          </div>
          <AgentStatusDot runtime={undefined} />
        </button>
        <button
          onClick={() => {
            setSettingsAnchor("general");
            navigate("settings");
          }}
          className={`p-2 rounded-lg transition-colors ${
            view === "settings" ? "bg-bg-hover text-text-primary" : "text-text-muted hover:text-text-primary hover:bg-bg-hover/60"
          }`}
          title="设置"
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>
    </aside>
  );
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "刚刚";
  if (min < 60) return `${min} 分钟前`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours} 小时前`;
  return `${Math.floor(hours / 24)} 天前`;
}
