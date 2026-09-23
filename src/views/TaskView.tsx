import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeHighlight from "rehype-highlight";
import {
  Folder,
  Square,
  Loader2,
  Sun,
  Moon,
  ExternalLink,
  Check,
  RotateCcw,
  SquareTerminal,
} from "lucide-react";
import { useAppStore } from "../store/appStore";
import { InputCard } from "../components/InputCard";
import { AgentIcon } from "../components/AgentIcon";
import { WORKSPACES } from "../data/workspaces";
import {
  busy,
  nativeView,
  NATIVE_AGENTS,
  PHASE_LABELS,
  useWorkspaceStore,
  workspaceRequest,
  type WorkspaceEvent,
} from "../lib/workspace";
import { runningInTauri } from "../lib/bridge";
import type { Task } from "../types/models";

export function Markdown({ text }: { text: string }) {
  return (
    <div className="message-markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          a: ({ children, href }) => (
            <a href={href} target="_blank" rel="noreferrer">
              {children}
            </a>
          ),
          pre: ({ children }) => (
            <div className="code-block">
              <button
                onClick={(e) => {
                  const code =
                    e.currentTarget.parentElement?.querySelector(
                      "code",
                    )?.textContent;
                  if (code) void navigator.clipboard.writeText(code);
                }}
              >
                复制
              </button>
              <pre>{children}</pre>
            </div>
          ),
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}

export function TaskView() {
  const app = useAppStore();
  const task = app.tasks.find((t) => t.id === app.selectedTaskId);
  const agent = app.agents.find((a) => a.id === task?.agentId);
  const state = useWorkspaceStore((s) =>
    task ? s.states[task.id] : undefined,
  );
  const [models, setModels] = useState<string[]>([]),
    [modelError, setModelError] = useState(""),
    [loading, setLoading] = useState(false),
    [history, setHistory] = useState(false),
    [clock, setClock] = useState(Date.now());
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const timer = setInterval(() => setClock(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [task?.messages[task.messages.length - 1]?.content, state?.phase]);
  const provider =
    task?.provider || (task?.agentId === "kimi-code" ? "kimi" : "native");
  useEffect(() => {
    let active = true;
    setModels([]);
    setModelError("");
    if (provider === "native") return;
    setLoading(true);
    workspaceRequest<string[]>("models", { provider })
      .then((m) => {
        if (active) setModels(m);
      })
      .catch((e) => {
        if (active) setModelError(String(e));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [provider, task?.id]);
  useEffect(() => {
    setHistory(false);
  }, [task?.id]);
  if (!task || !agent)
    return (
      <div className="flex h-full items-center justify-center text-text-muted">
        选择一个任务，或新建工作会话
      </div>
    );
  const spec = WORKSPACES[agent.id],
    isNative = NATIVE_AGENTS.has(agent.id),
    isBusy = busy(state),
    project = app.projects.find((p) => p.id === task.projectId);
  const currentModel =
    task.model || (provider === "kimi" ? "kimi-for-coding" : "");
  const overlay = !!app.agentDrawerId || app.paletteOpen || history;
  const installed = app.runtimes[agent.id]?.cliStatus === "installed";
  const approvePlan = () => {
    app.setTaskMode(task.id, "execute");
    void useAppStore
      .getState()
      .sendTaskMessage(
        task.id,
        "我已确认上述计划，请按计划开始执行。遇到超出计划范围或需要额外授权的操作先询问我。",
      );
  };
  return (
    <section
      className={`agent-workspace ${task.theme === "light" ? "workspace-light" : ""}`}
      data-agent={agent.id}
      style={
        {
          "--agent-accent": spec.accent,
          "--agent-surface": spec.surface,
        } as React.CSSProperties
      }
    >
      <header className="workspace-header">
        <div className="flex items-center gap-3 min-w-0">
          <AgentIcon agent={agent} />
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <span className="font-semibold tracking-tight">{spec.name}</span>
              <span className="workspace-badge">
                {isNative ? "官方原生界面" : "官方能力接入"}
              </span>
            </div>
            <div className="text-xs opacity-55 mt-1 truncate">
              {spec.description}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            title={
              isNative
                ? "切换外框明暗；原生页面风格请在其设置中调整"
                : "切换明暗风格"
            }
            className="workspace-icon"
            onClick={() =>
              app.setTaskConnection(task.id, {
                theme: task.theme === "light" ? "dark" : "light",
              })
            }
          >
            {task.theme === "light" ? <Moon size={16} /> : <Sun size={16} />}
          </button>
          <button
            title="官方终端"
            className="workspace-icon"
            onClick={() => void app.launchInteractive(agent.id, project?.path)}
          >
            <SquareTerminal size={16} />
          </button>
          <button
            className="workspace-icon"
            title="Agent 功能与设置"
            onClick={() => app.setAgentDrawer(agent.id)}
          >
            <ExternalLink size={16} />
          </button>
        </div>
      </header>
      <div className="workspace-toolbar">
        <span
          className="flex gap-1 items-center text-xs opacity-65 truncate max-w-52"
          title={project?.path}
        >
          <Folder size={13} />
          {project?.name || "项目"}
        </span>
        <select
          aria-label="切换 Agent 工作区"
          value={agent.id}
          disabled={isBusy}
          onChange={(e) => app.setTaskAgent(task.id, e.target.value)}
        >
          {app.agents.map((a) => (
            <option key={a.id} value={a.id}>
              {WORKSPACES[a.id].name}
            </option>
          ))}
        </select>
        {!["kimi-code", "openclaw", "opencode", "aider"].includes(agent.id) && (
          <select
            aria-label="模型服务"
            disabled={isBusy}
            value={provider}
            onChange={(e) =>
              app.setTaskConnection(task.id, {
                provider: e.target.value,
                model:
                  e.target.value === "kimi" ? "kimi-for-coding" : undefined,
              })
            }
          >
            <option value="native">Agent 原有登录与模型</option>
            {["codex", "claude-code", "pi-coding"].includes(agent.id) && (
              <option value="kimi">Kimi Code API</option>
            )}
            <option value={agent.modelProvider || "openai"}>
              {agent.modelProvider || "openai"} API
            </option>
          </select>
        )}
        {provider !== "native" && (
          <select
            aria-label="切换实际模型"
            disabled={isBusy || loading}
            value={currentModel}
            onChange={(e) =>
              app.setTaskConnection(task.id, { model: e.target.value })
            }
          >
            {!models.includes(currentModel) && (
              <option value={currentModel}>{currentModel || "选择模型"}</option>
            )}
            {models.map((m) => (
              <option key={m}>{m}</option>
            ))}
          </select>
        )}
        {loading && <Loader2 size={13} className="animate-spin" />}
        <div className="flex-1" />
        {isNative && task.messages.length > 0 && (
          <button
            className="text-xs opacity-65"
            onClick={() => setHistory(!history)}
          >
            {history ? "返回原生会话" : "迁移前记录"}
          </button>
        )}
        <a
          href={spec.docs}
          target="_blank"
          rel="noreferrer"
          className="text-xs opacity-65"
        >
          官方说明 ↗
        </a>
      </div>
      {modelError && (
        <div className="workspace-warning">模型读取失败：{modelError}</div>
      )}
      {spec.limits && <div className="workspace-note">{spec.limits}</div>}
      <div className="workspace-status" role="status">
        <span className={`status-orbit ${isBusy ? "active" : ""}`} />
        <span>{PHASE_LABELS[state?.phase || "idle"]}</span>
        {isBusy && state?.startedAt && (
          <span className="opacity-50">
            {Math.max(0, Math.floor((clock - state.startedAt) / 1000))} 秒
          </span>
        )}
        <span className="opacity-55 truncate flex-1">{state?.detail}</span>
        {isBusy && (
          <button
            className="flex items-center gap-1"
            onClick={() =>
              void workspaceRequest("stop", { taskId: task.id }).catch((e) =>
                useWorkspaceStore
                  .getState()
                  .patch(task.id, { detail: String(e) }),
              )
            }
          >
            <Square size={12} />
            停止
          </button>
        )}
      </div>
      {isNative && !history ? (
        <NativeWorkspace
          key={task.id}
          task={task}
          cwd={project?.path || "~"}
          installed={installed}
          hidden={overlay}
          model={currentModel}
        />
      ) : (
        <>
          <div className="workspace-conversation">
            {!task.messages.length && (
              <div className="workspace-empty">
                <AgentIcon agent={agent} size="xl" />
                <h2>与 {spec.name} 开始工作</h2>
                <p>从需求开始。先计划，确认后再执行。</p>
                <div className="flex gap-2 flex-wrap justify-center">
                  {spec.features.map((f) => (
                    <span key={f}>{f}</span>
                  ))}
                </div>
              </div>
            )}
            {task.messages.map((m) => (
              <article key={m.id} className={`workspace-message ${m.role}`}>
                <div className="message-author">
                  {m.role === "user" ? "你" : spec.name}
                  {m.durationMs ? (
                    <span> · {(m.durationMs / 1000).toFixed(1)} 秒</span>
                  ) : null}
                </div>
                <Markdown text={m.content || "正在等待 Agent 输出…"} />
              </article>
            ))}
            {!!state?.steps?.length && (
              <div className="workspace-plan">
                <h3>执行计划</h3>
                {state.steps.map((s, i) => (
                  <div key={i}>
                    {s.status === "completed" ? "✓" : "○"} {s.step}
                  </div>
                ))}
              </div>
            )}
            {!!state?.tools.length && (
              <details className="workspace-tools">
                <summary>工具活动 · {state.tools.length} 条</summary>
                {state.tools.map((t, i) => (
                  <pre key={i}>{JSON.stringify(t, null, 2)}</pre>
                ))}
              </details>
            )}
            {state?.diff && (
              <details className="workspace-tools" open>
                <summary>文件修改对比</summary>
                <Markdown text={"```diff\n" + state.diff + "\n```"} />
              </details>
            )}
            {Object.values(state?.approvals || {}).map((a) => (
              <Approval key={a.requestId} request={a} />
            ))}
            {state?.phase === "planReady" && (
              <div className="workspace-plan">
                <h3>计划已准备好</h3>
                <p>当前仍处于计划阶段。确认后才允许修改项目文件。</p>
                <button className="workspace-primary" onClick={approvePlan}>
                  <Check size={15} />
                  确认计划并执行
                </button>
                <span className="text-xs opacity-55 ml-3">
                  也可以在下方提出修改意见
                </span>
              </div>
            )}
            <div ref={end} />
          </div>
          {!history && (
            <div className="workspace-composer">
              <InputCard taskId={task.id} />
              <p>计划阶段仅调研和分析；模型与权限以当前 Agent 实际支持为准。</p>
            </div>
          )}
        </>
      )}
    </section>
  );
}

function NativeWorkspace({
  task,
  cwd,
  installed,
  hidden,
  model,
}: {
  task: Task;
  cwd: string;
  installed: boolean;
  hidden: boolean;
  model: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [url, setUrl] = useState(""),
    [error, setError] = useState(""),
    [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setUrl("");
    setError("");
    if (!installed) return;
    workspaceRequest<{ url: string; sessionId: string }>("prepare", {
      taskId: task.id,
      agentId: task.agentId,
      cwd,
      mode: task.mode,
      provider:
        task.provider || (task.agentId === "kimi-code" ? "kimi" : "native"),
      model,
    })
      .then((r) => {
        if (active) {
          setUrl(r.url);
          useWorkspaceStore
            .getState()
            .patch(task.id, { url: r.url, sessionId: r.sessionId });
        }
      })
      .catch((e) => {
        if (active) setError(String(e));
      });
    return () => {
      active = false;
      void nativeView(undefined, undefined, false);
    };
  }, [task.id, task.agentId, cwd, model, installed, retry]);
  useEffect(() => {
    if (!url || !ref.current) return;
    void nativeView(url, ref.current.getBoundingClientRect(), !hidden).catch(
      (e) => setError(String(e)),
    );
    return () => {
      void nativeView(undefined, undefined, false);
    };
  }, [url]);
  useEffect(() => {
    if (!ref.current || !url) return;
    const resize = () =>
      void nativeView(
        undefined,
        ref.current?.getBoundingClientRect(),
        !hidden,
      ).catch((e) => setError(String(e)));
    const ro = new ResizeObserver(resize);
    ro.observe(ref.current);
    window.addEventListener("resize", resize);
    resize();
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", resize);
    };
  }, [url, hidden]);
  return (
    <div className="native-workspace" ref={ref} aria-label="原生 Agent 工作区">
      {(!url || error || !runningInTauri()) && (
        <div className="workspace-empty">
          {!installed ? (
            <>
              <h2>尚未安装此 Agent</h2>
              <p>打开 Agent 详情完成安装和授权后，即可使用原生界面。</p>
              <button
                className="workspace-primary"
                onClick={() =>
                  useAppStore.getState().setAgentDrawer(task.agentId)
                }
              >
                打开 Agent 详情
              </button>
            </>
          ) : error ? (
            <>
              <h2>原生工作区尚未连接</h2>
              <p>{error}</p>
              <button
                className="workspace-primary"
                onClick={() => setRetry((x) => x + 1)}
              >
                <RotateCcw size={14} />
                重试连接
              </button>
            </>
          ) : (
            <>
              <Loader2 className="animate-spin" />
              <h2>正在打开官方原生界面</h2>
              <p>恢复项目、模型和会话…</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
function Approval({ request }: { request: WorkspaceEvent }) {
  const [answers, setAnswers] = useState<Record<string, string>>({}),
    [error, setError] = useState("");
  const respond = (allow: boolean) =>
    void workspaceRequest("approve", {
      taskId: request.taskId,
      requestId: request.requestId,
      allow,
      answers: Object.fromEntries(
        Object.entries(answers).map(([id, value]) => [
          id,
          { answers: [value] },
        ]),
      ),
    }).catch((e) => setError(String(e)));
  return (
    <div className="workspace-plan">
      <h3>{request.title || "Agent 需要你的回答"}</h3>
      {request.questions?.map((q) => (
        <label className="block my-3" key={q.id}>
          {q.question}
          <input
            className="block w-full p-2 mt-2 bg-transparent border rounded"
            value={answers[q.id] || ""}
            onChange={(e) =>
              setAnswers((a) => ({ ...a, [q.id]: e.target.value }))
            }
          />
          {q.options?.map((o) => (
            <button
              className="text-xs mr-3 mt-2"
              key={o.label}
              onClick={() => setAnswers((a) => ({ ...a, [q.id]: o.label }))}
            >
              {o.label}
            </button>
          ))}
        </label>
      ))}
      {!request.questions && (
        <details>
          <summary>查看操作内容</summary>
          <pre className="whitespace-pre-wrap text-xs">
            {JSON.stringify(request.detail, null, 2)}
          </pre>
        </details>
      )}
      <div className="flex gap-3 mt-3">
        <button className="workspace-primary" onClick={() => respond(true)}>
          {request.questions ? "提交回答" : "允许本次操作"}
        </button>
        {!request.questions && (
          <button onClick={() => respond(false)}>拒绝</button>
        )}
      </div>
      {error && <p>{error}</p>}
    </div>
  );
}
