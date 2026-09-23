import { useState } from "react";
import { useAppStore } from "../store/appStore";
import { IDLE_TEMPLATES } from "../data/agents";
import { AgentIcon } from "../components/AgentIcon";
import {
  CalendarClock,
  Plus,
  Trash2,
  Play,
  Loader2,
  CheckCircle2,
  XCircle,
  MoonStar,
  X,
} from "lucide-react";

/** 自动化视图：定时任务 + 闲时任务模板（ZCode 风格） */
export function AutomationView() {
  const {
    automations,
    agents,
    toggleAutomation,
    removeAutomation,
    runAutomationNow,
    automationRunning,
    createAutomation,
    prefs,
    setPref,
  } = useAppStore();
  const [creating, setCreating] = useState<"schedule" | "idle" | null>(null);

  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-lg font-bold mb-1">自动化</h1>
        <p className="text-xs text-text-secondary mb-6">
          创建定时任务，或排队在闲时算力空闲时后台执行。任务在 AgentHub 运行期间生效。
        </p>

        {/* 任务列表 */}
        <div className="bg-bg-card border border-border rounded-2xl min-h-40 flex flex-col items-center justify-center p-6 mb-4">
          {automations.length === 0 ? (
            <>
              <p className="text-sm text-text-muted mb-4">还没有定时任务</p>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setCreating("schedule")}
                  className="flex items-center gap-1.5 bg-text-primary text-bg-primary text-xs font-medium px-4 py-2 rounded-lg hover:opacity-85 transition-opacity"
                >
                  <Plus className="w-3.5 h-3.5" />
                  创建定时任务
                </button>
                <button
                  onClick={() => setCreating("idle")}
                  className="flex items-center gap-1.5 bg-bg-tertiary border border-border text-xs text-text-secondary hover:text-text-primary px-4 py-2 rounded-lg transition-colors"
                >
                  <MoonStar className="w-3.5 h-3.5" />
                  创建闲时任务
                </button>
              </div>
            </>
          ) : (
            <div className="w-full space-y-2">
              {automations.map((a) => {
                const agent = agents.find((x) => x.id === a.agentId);
                const running = automationRunning === a.id;
                return (
                  <div key={a.id} className="flex items-center gap-3 bg-bg-tertiary/50 border border-border rounded-xl p-3">
                    {agent && <AgentIcon agent={agent} size="sm" />}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{a.name}</p>
                      <p className="text-[10px] text-text-muted truncate">
                        {scheduleLabel(a.schedule)} ·{" "}
                        {a.lastRunAt
                          ? `上次 ${new Date(a.lastRunAt).toLocaleString("zh-CN")}`
                          : "从未运行"}
                      </p>
                    </div>
                    {a.lastOk != null &&
                      (a.lastOk ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-success shrink-0" />
                      ) : (
                        <XCircle className="w-3.5 h-3.5 text-danger shrink-0" />
                      ))}
                    <button
                      onClick={() => void runAutomationNow(a.id)}
                      disabled={running}
                      className="p-1.5 rounded-lg text-text-muted hover:text-accent-light hover:bg-bg-hover transition-colors disabled:opacity-50"
                      title="立即执行"
                    >
                      {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                    </button>
                    <Toggle value={a.enabled} onChange={(v) => toggleAutomation(a.id, v)} />
                    <button
                      onClick={() => removeAutomation(a.id)}
                      className="p-1.5 rounded-lg text-text-muted hover:text-danger transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
              <div className="flex justify-center pt-2">
                <button
                  onClick={() => setCreating("schedule")}
                  className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text-primary transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  创建定时任务
                </button>
              </div>
            </div>
          )}
        </div>

        {/* 保持唤醒 */}
        <div className="flex items-center gap-3 bg-bg-card border border-border rounded-xl px-4 py-3 mb-8">
          <CalendarClock className="w-4 h-4 text-text-muted shrink-0" />
          <span className="flex-1 text-xs text-text-secondary">AgentHub 运行任务时保持电脑唤醒（caffeinate）</span>
          <Toggle value={prefs.keepAwake} onChange={(v) => setPref("keepAwake", v)} />
        </div>

        {/* 闲时任务模板 */}
        <h2 className="text-sm font-semibold mb-3">闲时任务模板</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {IDLE_TEMPLATES.map((tpl) => (
            <button
              key={tpl.id}
              onClick={() => setCreating("idle")}
              className="text-left bg-bg-card border border-border hover:border-border-hover rounded-xl p-4 transition-colors"
            >
              <p className="text-xs font-semibold mb-1.5">{tpl.name}</p>
              <p className="text-[11px] text-text-muted leading-relaxed line-clamp-2">{tpl.description}</p>
              <p className="text-[10px] text-accent-light mt-2">最早可用时段</p>
            </button>
          ))}
        </div>
      </div>

      {creating && <CreateAutomationModal kind={creating} onClose={() => setCreating(null)} onCreate={(a) => {
        createAutomation(a);
        setCreating(null);
      }} />}
    </div>
  );
}

function scheduleLabel(s: { kind: string; time?: string; weekday?: number; minutes?: number }): string {
  const weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  switch (s.kind) {
    case "daily":
      return `每天 ${s.time}`;
    case "weekly":
      return `每${weekdays[s.weekday ?? 1]} ${s.time}`;
    case "interval":
      return `每 ${s.minutes} 分钟`;
    default:
      return "闲时（手动/空闲时执行）";
  }
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      onClick={() => onChange(!value)}
      className={`w-9 h-5 rounded-full transition-colors relative shrink-0 ${
        value ? "bg-accent" : "bg-bg-hover border border-border"
      }`}
    >
      <div
        className={`w-4 h-4 rounded-full bg-white shadow-sm absolute top-0.5 transition-transform ${
          value ? "translate-x-4" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

function CreateAutomationModal({
  kind,
  onClose,
  onCreate,
}: {
  kind: "schedule" | "idle";
  onClose: () => void;
  onCreate: (a: Parameters<ReturnType<typeof useAppStore.getState>["createAutomation"]>[0]) => void;
}) {
  const { agents, runtimes, projects, addProject } = useAppStore();
  const usable = agents.filter((a) => runtimes[a.id]?.cliStatus === "installed" || a.promptMode === "print");
  const [name, setName] = useState(kind === "idle" ? IDLE_TEMPLATES[0].name : "");
  const [prompt, setPrompt] = useState(kind === "idle" ? IDLE_TEMPLATES[0].prompt : "");
  const [agentId, setAgentId] = useState(usable[0]?.id ?? agents[0].id);
  const [projectId, setProjectId] = useState(projects[0]?.id ?? "");
  const [scheduleKind, setScheduleKind] = useState<"daily" | "weekly" | "interval">("daily");
  const [time, setTime] = useState("09:30");
  const [weekday, setWeekday] = useState(5);
  const [minutes, setMinutes] = useState(60);

  const valid = name.trim() && prompt.trim() && agentId && projectId;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-6" onClick={onClose}>
      <div
        className="bg-bg-secondary border border-border rounded-2xl w-full max-w-md p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold">{kind === "idle" ? "创建闲时任务" : "创建定时任务"}</h3>
          <button onClick={onClose} className="text-text-muted hover:text-text-primary">
            <X className="w-4 h-4" />
          </button>
        </div>

        <Field label="任务名称">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="例如：每日代码审查"
            className="w-full bg-bg-tertiary border border-border rounded-lg px-3 py-2 text-xs outline-none focus:border-accent"
          />
        </Field>

        <Field label="执行内容（Prompt）">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={3}
            placeholder="描述要让 Agent 自动完成的工作..."
            className="w-full bg-bg-tertiary border border-border rounded-lg px-3 py-2 text-xs outline-none focus:border-accent resize-none"
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="执行 Agent">
            <select
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
              className="w-full bg-bg-tertiary border border-border rounded-lg px-2.5 py-2 text-xs outline-none focus:border-accent"
            >
              {usable.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.displayName}
                </option>
              ))}
            </select>
          </Field>
          <Field label="项目目录">
            <select
              value={projectId}
              onChange={(e) => {
                if (e.target.value === "__add__") {
                  void addProject().then((p) => p && setProjectId(p.id));
                } else setProjectId(e.target.value);
              }}
              className="w-full bg-bg-tertiary border border-border rounded-lg px-2.5 py-2 text-xs outline-none focus:border-accent"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
              <option value="__add__">+ 添加目录...</option>
            </select>
          </Field>
        </div>

        {kind === "schedule" && (
          <div className="grid grid-cols-3 gap-3">
            <Field label="频率">
              <select
                value={scheduleKind}
                onChange={(e) => setScheduleKind(e.target.value as typeof scheduleKind)}
                className="w-full bg-bg-tertiary border border-border rounded-lg px-2.5 py-2 text-xs outline-none focus:border-accent"
              >
                <option value="daily">每天</option>
                <option value="weekly">每周</option>
                <option value="interval">间隔</option>
              </select>
            </Field>
            {scheduleKind === "weekly" && (
              <Field label="星期">
                <select
                  value={weekday}
                  onChange={(e) => setWeekday(Number(e.target.value))}
                  className="w-full bg-bg-tertiary border border-border rounded-lg px-2.5 py-2 text-xs outline-none focus:border-accent"
                >
                  {["日", "一", "二", "三", "四", "五", "六"].map((d, i) => (
                    <option key={i} value={i}>
                      周{d}
                    </option>
                  ))}
                </select>
              </Field>
            )}
            {scheduleKind === "interval" ? (
              <Field label="间隔（分钟）">
                <input
                  type="number"
                  min={5}
                  value={minutes}
                  onChange={(e) => setMinutes(Number(e.target.value))}
                  className="w-full bg-bg-tertiary border border-border rounded-lg px-3 py-2 text-xs outline-none focus:border-accent"
                />
              </Field>
            ) : (
              <Field label="时间">
                <input
                  type="time"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                  className="w-full bg-bg-tertiary border border-border rounded-lg px-3 py-2 text-xs outline-none focus:border-accent"
                />
              </Field>
            )}
          </div>
        )}

        <button
          disabled={!valid}
          onClick={() =>
            onCreate({
              name: name.trim(),
              prompt: prompt.trim(),
              agentId,
              projectId,
              enabled: true,
              schedule:
                kind === "idle"
                  ? { kind: "idle" }
                  : scheduleKind === "interval"
                    ? { kind: "interval", minutes }
                    : scheduleKind === "weekly"
                      ? { kind: "weekly", time, weekday }
                      : { kind: "daily", time },
            })
          }
          className="w-full bg-accent hover:bg-accent-light disabled:bg-bg-tertiary disabled:text-text-muted text-white text-xs font-medium py-2.5 rounded-lg transition-colors"
        >
          创建
        </button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[11px] text-text-muted mb-1.5">{label}</p>
      {children}
    </div>
  );
}
