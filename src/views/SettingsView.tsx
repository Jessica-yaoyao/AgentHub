import { useState } from "react";
import { useAppStore } from "../store/appStore";
import { AUTH_LABELS } from "../components/AgentIcon";
import {
  Eye,
  EyeOff,
  KeyRound,
  Bell,
  Shield,
  Database,
  Info,
  Loader2,
  RefreshCw,
  Save,
  Trash2,
  ShieldCheck,
} from "lucide-react";

const KNOWN_ENV_KEYS = [
  {
    key: "ANTHROPIC_API_KEY",
    label: "Anthropic（Claude Code）",
    placeholder: "sk-ant-...",
  },
  {
    key: "OPENAI_API_KEY",
    label: "OpenAI（Codex / 通用）",
    placeholder: "sk-...",
  },
  {
    key: "GEMINI_API_KEY",
    label: "Google AI（Gemini CLI）",
    placeholder: "AIza...",
  },
  { key: "MOONSHOT_API_KEY", label: "Kimi（Moonshot）", placeholder: "sk-..." },
  {
    key: "DASHSCOPE_API_KEY",
    label: "阿里云百炼（Qwen）",
    placeholder: "sk-...",
  },
];

/** 设置视图 */
export function SettingsView() {
  const { settingsAnchor } = useAppStore();
  return (
    <div className="h-full overflow-y-auto p-6">
      <div className="max-w-2xl mx-auto space-y-5">
        <h1 className="text-lg font-bold">设置</h1>
        {(settingsAnchor === "apikeys" || true) && <ApiKeysGroup />}
        <AgentsStatusGroup />
        <GeneralGroup />
        <DataGroup />
        <AboutGroup />
      </div>
    </div>
  );
}

function Group({
  id,
  title,
  icon: Icon,
  children,
}: {
  id: string;
  title: string;
  icon: typeof KeyRound;
  children: React.ReactNode;
}) {
  return (
    <section
      id={`settings-${id}`}
      className="bg-bg-card border border-border rounded-xl scroll-mt-4"
    >
      <div className="px-5 py-3 border-b border-border flex items-center gap-2">
        <Icon className="w-4 h-4 text-text-muted" />
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      <div className="divide-y divide-border">{children}</div>
    </section>
  );
}

function ApiKeysGroup() {
  const {
    apiKeyStatus,
    saveApiKey,
    removeApiKey,
    availableModels,
    selectedModels,
    modelLoading,
    modelErrors,
    validationMessages,
    refreshModels,
    setSelectedModel,
    validateApiKey,
  } = useAppStore();
  const [visible, setVisible] = useState<Record<string, boolean>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});

  const save = async (key: string) => {
    const value = drafts[key]?.trim();
    if (!value) return;
    setSaving((s) => ({ ...s, [key]: true }));
    try {
      await saveApiKey(key, value);
      setDrafts((s) => ({ ...s, [key]: "" }));
      setVisible((s) => ({ ...s, [key]: false }));
    } finally {
      setSaving((s) => ({ ...s, [key]: false }));
    }
  };

  return (
    <Group id="apikeys" title="API 密钥" icon={KeyRound}>
      {KNOWN_ENV_KEYS.map((item) => (
        <div key={item.key} className="px-5 py-3">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-sm">{item.label}</span>
            <span
              className={`text-[10px] px-2 py-0.5 rounded-full ${
                apiKeyStatus[item.key]
                  ? "bg-success/10 text-success"
                  : "bg-bg-tertiary text-text-muted"
              }`}
            >
              {apiKeyStatus[item.key] ? "已安全保存" : "未配置"}
            </span>
          </div>
          <div className="flex gap-2">
            <div className="flex flex-1 items-center bg-bg-tertiary border border-border rounded-lg px-3">
              <input
                type={visible[item.key] ? "text" : "password"}
                value={drafts[item.key] || ""}
                onChange={(e) =>
                  setDrafts((s) => ({ ...s, [item.key]: e.target.value }))
                }
                placeholder={
                  apiKeyStatus[item.key]
                    ? "已保存在 macOS 钥匙串；输入新密钥可替换"
                    : item.placeholder
                }
                autoComplete="off"
                className="flex-1 min-w-0 bg-transparent py-2 text-xs font-mono outline-none placeholder:text-text-muted"
              />
              <button
                onClick={() =>
                  setVisible((v) => ({ ...v, [item.key]: !v[item.key] }))
                }
                className="text-text-muted hover:text-text-primary"
                title={visible[item.key] ? "隐藏本次输入" : "显示本次输入"}
              >
                {visible[item.key] ? (
                  <EyeOff className="w-3.5 h-3.5" />
                ) : (
                  <Eye className="w-3.5 h-3.5" />
                )}
              </button>
            </div>
            <button
              onClick={() => void save(item.key)}
              disabled={!drafts[item.key]?.trim() || saving[item.key]}
              className="flex items-center gap-1.5 rounded-lg border border-border px-3 text-xs text-text-secondary hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40"
            >
              {saving[item.key] ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Save className="w-3.5 h-3.5" />
              )}
              {apiKeyStatus[item.key] ? "替换" : "保存"}
            </button>
          </div>

          {apiKeyStatus[item.key] && (
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <select
                value={selectedModels[item.key] || ""}
                onChange={(e) => setSelectedModel(item.key, e.target.value)}
                disabled={
                  modelLoading[item.key] || !availableModels[item.key]?.length
                }
                className="min-w-56 flex-1 rounded-lg border border-border bg-bg-tertiary px-3 py-2 text-xs outline-none disabled:opacity-60"
              >
                {!availableModels[item.key]?.length && (
                  <option value="">尚未读取到模型</option>
                )}
                {(availableModels[item.key] || []).map((model) => (
                  <option key={model} value={model}>
                    {model}
                  </option>
                ))}
              </select>
              <button
                onClick={() => void refreshModels(item.key)}
                disabled={modelLoading[item.key]}
                className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-xs text-text-secondary hover:text-text-primary disabled:opacity-50"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 ${modelLoading[item.key] ? "animate-spin" : ""}`}
                />
                读取模型
              </button>
              <button
                onClick={() => void validateApiKey(item.key)}
                disabled={modelLoading[item.key]}
                className="flex items-center gap-1.5 rounded-lg border border-success/30 bg-success/10 px-3 py-2 text-xs text-success hover:bg-success/15 disabled:opacity-50"
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                验证连接
              </button>
              <button
                onClick={() => {
                  if (window.confirm(`确定删除 ${item.label} 的密钥？`))
                    void removeApiKey(item.key);
                }}
                className="p-2 text-text-muted hover:text-danger"
                title="删除密钥"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
          {modelErrors[item.key] && (
            <p className="mt-1.5 text-[10px] text-danger">
              模型读取失败：{modelErrors[item.key]}
            </p>
          )}
          {validationMessages[item.key] && (
            <p className="mt-1.5 text-[10px] text-text-secondary">
              {validationMessages[item.key]}
            </p>
          )}
          <p className="text-[10px] text-text-muted mt-1.5 flex items-center gap-1">
            <ShieldCheck className="w-3 h-3" />
            <code className="font-mono">{item.key}</code> · 密钥保存在 macOS
            钥匙串，界面不会回显
          </p>
        </div>
      ))}
    </Group>
  );
}

function AgentsStatusGroup() {
  const { agents, runtimes, setAgentDrawer } = useAppStore();
  return (
    <Group id="agents" title="Agent 状态" icon={Shield}>
      {agents.map((a) => {
        const rt = runtimes[a.id];
        const auth = AUTH_LABELS[rt?.auth ?? "unknown"];
        return (
          <button
            key={a.id}
            onClick={() => setAgentDrawer(a.id)}
            className="w-full flex items-center justify-between px-5 py-2.5 hover:bg-bg-hover transition-colors"
          >
            <span className="text-sm">{a.displayName}</span>
            <span className="flex items-center gap-2">
              <span
                className={`text-[10px] px-2 py-0.5 rounded-full ${auth.className}`}
              >
                {auth.label}
              </span>
              <span
                className={`text-[10px] ${
                  rt?.cliStatus === "installed"
                    ? "text-success"
                    : rt?.cliStatus === "broken"
                      ? "text-warning"
                      : rt?.desktopInstalled
                        ? "text-info"
                        : "text-text-muted"
                }`}
              >
                {rt?.cliStatus === "installed"
                  ? "CLI 可用"
                  : rt?.cliStatus === "broken"
                    ? "异常"
                    : rt?.desktopInstalled
                      ? "桌面端"
                      : "未安装"}
              </span>
            </span>
          </button>
        );
      })}
    </Group>
  );
}

function GeneralGroup() {
  const { systemInfo } = useAppStore();
  return (
    <Group id="general" title="通用" icon={Bell}>
      <Row label="桌面通知">
        <span className="text-xs text-text-muted">
          尚未接入系统通知；请查看任务状态
        </span>
      </Row>
      <Row label="安全模式（危险命令需确认）">
        <span className="text-xs text-text-muted">
          由各 Agent 的计划约束与工具授权控制，不提供全局绕过
        </span>
      </Row>
      <Row label="Node.js">
        <span className="text-xs text-text-muted font-mono">
          {systemInfo?.node || "未检测到"}
        </span>
      </Row>
      <Row label="uv（Python 工具安装）">
        <span className="text-xs text-text-muted font-mono">
          {systemInfo?.uv || "未检测到"}
        </span>
      </Row>
      <Row label="独立 npm 前缀">
        <span className="text-xs text-text-muted font-mono">
          ~/.agenthub/npm-global
        </span>
      </Row>
    </Group>
  );
}

function DataGroup() {
  const { tasks, automations, runRecords, resetAllData } = useAppStore();
  return (
    <Group id="data" title="数据" icon={Database}>
      <Row label="任务">
        <span className="text-xs text-text-muted">{tasks.length} 个</span>
      </Row>
      <Row label="自动化">
        <span className="text-xs text-text-muted">{automations.length} 个</span>
      </Row>
      <Row label="执行日志">
        <span className="text-xs text-text-muted">{runRecords.length} 条</span>
      </Row>
      <Row label="清除全部本地数据">
        <button
          onClick={() => {
            if (
              window.confirm(
                "将清除任务、自动化、API 密钥与模拟安装状态，确定继续？",
              )
            )
              resetAllData();
          }}
          className="text-xs text-danger hover:text-danger/80 transition-colors"
        >
          清除
        </button>
      </Row>
    </Group>
  );
}

function AboutGroup() {
  const { systemInfo } = useAppStore();
  return (
    <Group id="about" title="关于" icon={Info}>
      <Row label="版本">
        <span className="text-xs text-text-muted">AgentHub v0.5.0</span>
      </Row>
      <Row label="架构">
        <span className="text-xs text-text-muted">
          Tauri 2 + React 19 + Rust
        </span>
      </Row>
      <Row label="平台">
        <span className="text-xs text-text-muted font-mono">
          {systemInfo?.os ?? "-"}/{systemInfo?.arch ?? "-"}
        </span>
      </Row>
    </Group>
  );
}

function Row({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between px-5 py-3 gap-4">
      <span className="text-sm shrink-0">{label}</span>
      {children}
    </div>
  );
}
