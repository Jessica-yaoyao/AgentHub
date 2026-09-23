import { useEffect, useRef, useState } from "react";
import { useAppStore } from "../store/appStore";
import type { TaskMode } from "../types/models";
import { AgentIcon, AgentStatusDot } from "./AgentIcon";
import {
  Plus,
  ChevronDown,
  ArrowUp,
  Loader2,
  Check,
  Folder,
} from "lucide-react";
import { busy, useWorkspaceStore } from "../lib/workspace";

/**
 * ZCode 风格大输入卡片：@ 添加上下文 / 模式切换 / Agent 选择器 / 发送
 * home 模式下提交会创建新任务；task 模式下发送到当前任务。
 */
export function InputCard({
  taskId,
  autoFocus,
  onSubmitted,
}: {
  taskId?: string;
  autoFocus?: boolean;
  onSubmitted?: () => void;
}) {
  const {
    agents,
    runtimes,
    tasks,
    projects,
    createTask,
    sendTaskMessage,
    setTaskAgent,
    setTaskMode,
    addProject,
    apiKeyStatus,
    availableModels,
    selectedModels,
    modelLoading,
    refreshModels,
    setSelectedModel,
  } = useAppStore();

  const task = tasks.find((t) => t.id === taskId);
  const [text, setText] = useState("");
  const [submitting, setSending] = useState(false);
  const state = useWorkspaceStore((s) =>
    taskId ? s.states[taskId] : undefined,
  );
  const sending = submitting || busy(state);
  const [agentMenuOpen, setAgentMenuOpen] = useState(false);
  const [modeMenuOpen, setModeMenuOpen] = useState(false);
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const [contextMenuOpen, setContextMenuOpen] = useState(false);
  const [modelMenuOpen, setModelMenuOpen] = useState(false);
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(
    null,
  );
  const [mode, setMode] = useState<TaskMode>("plan");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const agentId =
    task?.agentId ?? selectedAgentId ?? defaultAgentId(agents, runtimes);
  const agent = agents.find((a) => a.id === agentId);
  const projectId = task?.projectId ?? selectedProjectId ?? projects[0]?.id;
  const project = projects.find((p) => p.id === projectId);
  const currentMode = task?.mode ?? mode;
  const modelKey =
    !task && agent?.id === "kimi-code" ? agent.envKey : undefined;
  const models = modelKey ? availableModels[modelKey] || [] : [];
  const selectedModel = modelKey
    ? selectedModels[modelKey] || agent?.defaultModel || ""
    : "";

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setAgentMenuOpen(false);
        setModeMenuOpen(false);
        setProjectMenuOpen(false);
        setContextMenuOpen(false);
        setModelMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const submit = async () => {
    const value = text.trim();
    if (!value || sending) return;
    setSending(true);
    try {
      let id = taskId;
      if (!id) {
        id = createTask({ projectId, agentId, mode: currentMode });
      }
      await sendTaskMessage(id, value);
      setText("");
      onSubmitted?.();
    } finally {
      setSending(false);
      textareaRef.current?.focus();
    }
  };

  const insertContext = (snippet: string) => {
    setText((t) => (t ? `${t}\n${snippet}` : snippet));
    setContextMenuOpen(false);
    textareaRef.current?.focus();
  };

  return (
    <div
      ref={wrapRef}
      className="bg-bg-card border border-border rounded-2xl shadow-lg shadow-black/20"
    >
      {/* 项目选择 */}
      <div className="px-4 pt-3">
        <div className="relative inline-block">
          <button
            disabled={!!taskId || sending}
            onClick={() => setProjectMenuOpen(!projectMenuOpen)}
            className="flex items-center gap-1.5 text-xs text-text-secondary hover:text-text-primary bg-bg-tertiary/60 hover:bg-bg-tertiary px-2.5 py-1.5 rounded-lg transition-colors"
          >
            <Folder className="w-3.5 h-3.5 text-warning" />
            {project ? project.name : "选择项目"}
            <ChevronDown className="w-3 h-3 text-text-muted" />
          </button>
          {projectMenuOpen && (
            <Menu>
              {projects.map((p) => (
                <MenuItem
                  key={p.id}
                  active={p.id === projectId}
                  onClick={() => {
                    setSelectedProjectId(p.id);
                    setProjectMenuOpen(false);
                  }}
                >
                  <Folder className="w-3.5 h-3.5 text-warning" />
                  <span className="flex-1 truncate">{p.name}</span>
                  <span className="text-[10px] text-text-muted truncate max-w-32">
                    {p.path}
                  </span>
                </MenuItem>
              ))}
              <div className="border-t border-border mt-1 pt-1">
                <MenuItem
                  onClick={() => {
                    setProjectMenuOpen(false);
                    void addProject();
                  }}
                >
                  <Plus className="w-3.5 h-3.5" />
                  添加项目目录...
                </MenuItem>
              </div>
            </Menu>
          )}
        </div>
      </div>

      {/* 输入区 */}
      <div className="px-4 pt-2 pb-1">
        <textarea
          ref={textareaRef}
          value={text}
          autoFocus={autoFocus}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (
              e.key === "Enter" &&
              !e.shiftKey &&
              !e.nativeEvent.isComposing
            ) {
              e.preventDefault();
              void submit();
            }
          }}
          placeholder={
            agent ? `向 ${agent.displayName} 描述任务…` : "输入任务描述..."
          }
          className="w-full bg-transparent resize-none outline-none text-sm leading-relaxed placeholder:text-text-muted min-h-[52px] max-h-48"
          rows={2}
        />
      </div>

      {/* 底部工具条 */}
      <div className="flex items-center gap-1.5 px-3 pb-3">
        {/* @ 添加上下文 */}
        <div className="relative">
          <button
            onClick={() => setContextMenuOpen(!contextMenuOpen)}
            className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-hover transition-colors"
            title="添加上下文"
          >
            <Plus className="w-4 h-4" />
          </button>
          {contextMenuOpen && (
            <Menu>
              <MenuItem
                onClick={() =>
                  project && insertContext(`@项目目录 ${project.path}`)
                }
              >
                <span className="text-accent-light font-mono text-xs">@</span>
                项目目录路径
              </MenuItem>
              {agent && (
                <MenuItem
                  onClick={() => insertContext(`@${agent.displayName} `)}
                >
                  <span className="text-accent-light font-mono text-xs">@</span>
                  提及 {agent.displayName}
                </MenuItem>
              )}
              <MenuItem
                onClick={() => insertContext("请读取当前项目结构后再回答。")}
              >
                <span className="text-accent-light font-mono text-xs">/</span>
                读取项目结构
              </MenuItem>
              <MenuItem
                onClick={() =>
                  insertContext("请先给出计划，等待我确认后再执行。")
                }
              >
                <span className="text-accent-light font-mono text-xs">/</span>
                先计划后执行
              </MenuItem>
            </Menu>
          )}
        </div>

        {/* 模式切换 */}
        <div className="relative">
          <button
            disabled={sending}
            onClick={() => setModeMenuOpen(!modeMenuOpen)}
            className="flex items-center gap-1.5 text-xs text-text-secondary hover:text-text-primary px-2.5 py-1.5 rounded-lg hover:bg-bg-hover transition-colors"
          >
            {currentMode === "plan" ? "计划模式" : "执行模式"}
            <ChevronDown className="w-3 h-3 text-text-muted" />
          </button>
          {modeMenuOpen && (
            <Menu>
              {(
                [
                  {
                    id: "plan",
                    label: "计划模式",
                    desc: "先输出计划，确认后再动手",
                  },
                  {
                    id: "execute",
                    label: "执行模式",
                    desc: "直接执行并返回结果",
                  },
                ] as const
              ).map((m) => (
                <MenuItem
                  key={m.id}
                  active={currentMode === m.id}
                  onClick={() => {
                    if (task) setTaskMode(task.id, m.id);
                    else setMode(m.id);
                    setModeMenuOpen(false);
                  }}
                >
                  <span className="flex-1">
                    {m.label}
                    <span className="block text-[10px] text-text-muted">
                      {m.desc}
                    </span>
                  </span>
                  {currentMode === m.id && (
                    <Check className="w-3.5 h-3.5 text-accent-light" />
                  )}
                </MenuItem>
              ))}
            </Menu>
          )}
        </div>

        <div className="flex-1" />

        {/* 模型选择器 */}
        {modelKey &&
          apiKeyStatus[modelKey] &&
          (models.length > 0 ||
            modelLoading[modelKey] ||
            Boolean(agent?.defaultModel)) && (
            <div className="relative">
              <button
                onClick={() => {
                  setModelMenuOpen(!modelMenuOpen);
                  if (!models.length && !modelLoading[modelKey])
                    void refreshModels(modelKey);
                }}
                className="flex max-w-44 items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs text-text-secondary transition-colors hover:bg-bg-hover hover:text-text-primary"
                title="切换模型"
              >
                {modelLoading[modelKey] ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : null}
                <span className="truncate">{selectedModel || "选择模型"}</span>
                <ChevronDown className="w-3 h-3 shrink-0 text-text-muted" />
              </button>
              {modelMenuOpen && (
                <Menu wide>
                  {models.length ? (
                    models.map((modelName) => (
                      <MenuItem
                        key={modelName}
                        active={selectedModel === modelName}
                        onClick={() => {
                          setSelectedModel(modelKey, modelName);
                          setModelMenuOpen(false);
                        }}
                      >
                        <span className="flex-1 truncate text-left">
                          {modelName}
                        </span>
                        {selectedModel === modelName && (
                          <Check className="w-3.5 h-3.5 text-accent-light" />
                        )}
                      </MenuItem>
                    ))
                  ) : (
                    <MenuItem onClick={() => void refreshModels(modelKey)}>
                      <span className="flex-1 text-left">重新读取可用模型</span>
                    </MenuItem>
                  )}
                </Menu>
              )}
            </div>
          )}

        {/* Agent 选择器 */}
        <div className="relative">
          <button
            onClick={() => setAgentMenuOpen(!agentMenuOpen)}
            className="flex items-center gap-1.5 text-xs text-text-secondary hover:text-text-primary px-2.5 py-1.5 rounded-lg hover:bg-bg-hover transition-colors"
          >
            {agent && <AgentStatusDot runtime={runtimes[agent.id]} />}
            {agent ? agent.displayName : "选择 Agent"}
            <ChevronDown className="w-3 h-3 text-text-muted" />
          </button>
          {agentMenuOpen && (
            <Menu wide>
              {agents.map((a) => {
                const rt = runtimes[a.id];
                const usable = rt?.cliStatus === "installed";
                return (
                  <MenuItem
                    key={a.id}
                    active={a.id === agentId}
                    onClick={() => {
                      if (task) setTaskAgent(task.id, a.id);
                      else setSelectedAgentId(a.id);
                      setAgentMenuOpen(false);
                    }}
                  >
                    <AgentIcon agent={a} size="sm" />
                    <span className="flex-1 truncate">{a.displayName}</span>
                    <span
                      className={`text-[10px] ${
                        usable
                          ? "text-success"
                          : rt?.cliStatus === "broken"
                            ? "text-warning"
                            : "text-text-muted"
                      }`}
                    >
                      {usable
                        ? "可用"
                        : rt?.cliStatus === "broken"
                          ? "异常"
                          : rt?.desktopInstalled
                            ? "桌面端"
                            : "未安装"}
                    </span>
                  </MenuItem>
                );
              })}
            </Menu>
          )}
        </div>

        {/* 发送 */}
        <button
          onClick={() => void submit()}
          disabled={!text.trim() || sending}
          className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${
            text.trim() && !sending
              ? "bg-text-primary text-bg-primary hover:opacity-85"
              : "bg-bg-tertiary text-text-muted cursor-not-allowed"
          }`}
          title="发送"
        >
          {sending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <ArrowUp className="w-4 h-4" />
          )}
        </button>
      </div>
    </div>
  );
}

function defaultAgentId(
  agents: ReturnType<typeof useAppStore.getState>["agents"],
  runtimes: ReturnType<typeof useAppStore.getState>["runtimes"],
): string {
  const ready = agents.find(
    (a) =>
      runtimes[a.id]?.cliStatus === "installed" && a.promptMode === "print",
  );
  return ready?.id ?? agents[0]?.id ?? "";
}

function Menu({
  children,
  wide,
}: {
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <div
      className={`absolute bottom-full mb-1.5 left-0 ${wide ? "w-64" : "w-56"} max-h-72 overflow-y-auto bg-bg-secondary border border-border rounded-xl shadow-xl shadow-black/40 py-1 z-50`}
    >
      {children}
    </div>
  );
}

function MenuItem({
  children,
  onClick,
  active,
}: {
  children: React.ReactNode;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-3 py-2 text-xs transition-colors ${
        active
          ? "bg-accent/10 text-text-primary"
          : "text-text-secondary hover:bg-bg-hover hover:text-text-primary"
      }`}
    >
      {children}
    </button>
  );
}
