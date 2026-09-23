import { useEffect, useState } from "react";
import { useAppStore } from "../store/appStore";
import { AgentIcon, AUTH_LABELS, runtimeLabel } from "../components/AgentIcon";
import {
  X,
  Download,
  Loader2,
  Wrench,
  Trash2,
  SquareTerminal,
  AppWindow,
  ExternalLink,
  Eye,
  EyeOff,
  CheckCircle2,
  XCircle,
} from "lucide-react";

/** Agent 详情抽屉：检测信息 / 登录态 / API Key / 命令 / 操作 / 日志 */
export function AgentDrawer() {
  const {
    agentDrawerId,
    setAgentDrawer,
    agents,
    runtimes,
    installAgent,
    repairAgent,
    uninstallAgent,
    launchInteractive,
    openDesktop,
    launchKimiWeb,
    apiKeyStatus,
    saveApiKey,
    availableModels,
    selectedModels,
    modelLoading,
    refreshModels,
    setSelectedModel,
    validateApiKey,
    validationMessages,
    runRecords,
  } = useAppStore();
  const [showKey, setShowKey] = useState(false);
  const [keyDraft, setKeyDraft] = useState("");
  const [savingKey, setSavingKey] = useState(false);
  const [launchMsg, setLaunchMsg] = useState<string | null>(null);

  useEffect(() => {
    setKeyDraft("");
    setShowKey(false);
    setLaunchMsg(null);
  }, [agentDrawerId]);

  const agent = agents.find((a) => a.id === agentDrawerId);
  if (!agent) return null;
  const rt = runtimes[agent.id];
  const cliOk = rt?.cliStatus === "installed";
  const broken = rt?.cliStatus === "broken";
  const checking = rt?.cliStatus === "checking";
  const authInfo = AUTH_LABELS[rt?.auth ?? "unknown"];
  const logs = runRecords.filter((r) => r.label.includes(agent.displayName)).slice(0, 10);
  const keyConfigured = Boolean(agent.envKey && apiKeyStatus[agent.envKey]);
  const models = agent.envKey ? availableModels[agent.envKey] || [] : [];

  const saveKey = async () => {
    if (!agent.envKey || !keyDraft.trim()) return;
    setSavingKey(true);
    try {
      await saveApiKey(agent.envKey, keyDraft.trim());
      setKeyDraft("");
      setShowKey(false);
    } finally {
      setSavingKey(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50" onClick={() => setAgentDrawer(null)}>
      <div className="absolute inset-0 bg-black/50" />
      <div
        className="absolute right-0 top-0 bottom-0 w-[420px] bg-bg-secondary border-l border-border flex flex-col animate-slide-left"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 头部 */}
        <div className="flex items-center gap-3 p-4 border-b border-border">
          <AgentIcon agent={agent} size="lg" />
          <div className="flex-1 min-w-0">
            <h2 className="text-sm font-bold truncate">{agent.displayName}</h2>
            <p className="text-[11px] text-text-muted">{runtimeLabel(rt)}</p>
          </div>
          <button
            onClick={() => setAgentDrawer(null)}
            className="p-1.5 rounded-lg text-text-muted hover:text-text-primary hover:bg-bg-hover transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <p className="text-xs text-text-secondary leading-relaxed">{agent.description}</p>

          {/* 操作 */}
          <div className="flex flex-wrap gap-2">
            {checking ? (
              <span className="flex items-center gap-1.5 text-xs text-text-muted px-3 py-2">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> 处理中...
              </span>
            ) : cliOk ? (
              <>
                <ActionBtn onClick={() => void launchInteractive(agent.id).then(setLaunchMsg)}>
                  <SquareTerminal className="w-3.5 h-3.5" /> 终端打开
                </ActionBtn>
                <ActionBtn danger onClick={() => {
                  if (window.confirm(`确定卸载 ${agent.displayName}？`)) void uninstallAgent(agent.id);
                }}>
                  <Trash2 className="w-3.5 h-3.5" /> 卸载
                </ActionBtn>
              </>
            ) : broken ? (
              <ActionBtn tone="warning" onClick={() => void repairAgent(agent.id)}>
                <Wrench className="w-3.5 h-3.5" /> 修复安装
              </ActionBtn>
            ) : (
              <ActionBtn tone="success" onClick={() => void installAgent(agent.id)}>
                <Download className="w-3.5 h-3.5" /> 一键安装
              </ActionBtn>
            )}
            {rt?.desktopInstalled && (
              <ActionBtn onClick={() => void openDesktop(agent.id).then(setLaunchMsg)}>
                <AppWindow className="w-3.5 h-3.5" /> 打开桌面客户端
              </ActionBtn>
            )}
            {agent.nativeWeb && cliOk && (
              <ActionBtn
                onClick={() => {
                  setLaunchMsg("正在启动 Kimi Code 图形界面...");
                  void launchKimiWeb().then(setLaunchMsg).catch((e) => setLaunchMsg(`启动失败：${String(e)}`));
                }}
              >
                <AppWindow className="w-3.5 h-3.5" /> Kimi 图形界面
              </ActionBtn>
            )}
            {agent.website && (
              <a
                href={agent.website}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1.5 text-xs text-text-secondary hover:text-text-primary bg-bg-card border border-border px-3 py-2 rounded-lg transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5" /> 官网
              </a>
            )}
          </div>
          {launchMsg && (
            <p className="text-[11px] text-text-muted bg-bg-tertiary rounded-lg px-3 py-2">{launchMsg}</p>
          )}

          {/* 检测信息 */}
          <Section title="本地检测">
            <Row label="CLI 状态" value={runtimeLabel(rt)} />
            {rt?.cliPath && <Row label="可执行路径" value={rt.cliPath} mono />}
            {rt?.cliVersion && <Row label="版本" value={rt.cliVersion} mono />}
            {broken && rt?.cliError && (
              <pre className="text-[10px] font-mono text-warning bg-warning/5 rounded-lg p-2.5 whitespace-pre-wrap break-all">
                {rt.cliError}
              </pre>
            )}
            <Row
              label="桌面客户端"
              value={rt?.desktopInstalled ? `已安装 ${rt.desktopVersion ?? ""}` : "未安装"}
            />
            <Row label="登录态">
              <span className={`text-[10px] px-2 py-0.5 rounded-full ${authInfo.className}`}>
                {authInfo.label}
              </span>
            </Row>
          </Section>

          {/* API Key */}
          {agent.apiKeyRequired && agent.envKey && (
            <Section title={`API 密钥（${agent.envKey}）`}>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[11px] text-text-muted">当前状态</span>
                <span className={`text-[10px] px-2 py-0.5 rounded-full ${keyConfigured ? "bg-success/10 text-success" : "bg-bg-tertiary text-text-muted"}`}>
                  {keyConfigured ? "已安全保存" : "未配置"}
                </span>
              </div>
              <div className="flex items-center bg-bg-tertiary border border-border rounded-lg px-3">
                <input
                  type={showKey ? "text" : "password"}
                  value={keyDraft}
                  onChange={(e) => setKeyDraft(e.target.value)}
                  placeholder={keyConfigured ? "输入新密钥可替换" : "sk-..."}
                  autoComplete="off"
                  className="flex-1 bg-transparent py-2 text-xs font-mono outline-none placeholder:text-text-muted"
                />
                <button onClick={() => setShowKey(!showKey)} className="text-text-muted hover:text-text-primary">
                  {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
              <button
                onClick={() => void saveKey()}
                disabled={!keyDraft.trim() || savingKey}
                className="mt-2 w-full rounded-lg border border-border bg-bg-tertiary px-3 py-2 text-xs text-text-secondary hover:text-text-primary disabled:cursor-not-allowed disabled:opacity-40"
              >
                {savingKey ? "保存中..." : keyConfigured ? "替换并安全保存" : "安全保存"}
              </button>
              {keyConfigured && agent.modelProvider && (
                <div className="mt-2.5 space-y-2">
                  <select
                    value={selectedModels[agent.envKey] || ""}
                    onChange={(e) => setSelectedModel(agent.envKey!, e.target.value)}
                    disabled={modelLoading[agent.envKey] || !models.length}
                    className="w-full rounded-lg border border-border bg-bg-tertiary px-3 py-2 text-xs outline-none disabled:opacity-60"
                  >
                    {!models.length && <option value="">尚未读取到模型</option>}
                    {models.map((model) => <option key={model} value={model}>{model}</option>)}
                  </select>
                  <div className="flex gap-2">
                    <button
                      onClick={() => void refreshModels(agent.envKey!)}
                      disabled={modelLoading[agent.envKey]}
                      className="flex-1 rounded-lg border border-border px-2 py-1.5 text-[10px] text-text-secondary disabled:opacity-50"
                    >
                      {modelLoading[agent.envKey] ? "读取中..." : "重新读取模型"}
                    </button>
                    <button
                      onClick={() => void validateApiKey(agent.envKey!)}
                      className="flex-1 rounded-lg border border-success/30 bg-success/10 px-2 py-1.5 text-[10px] text-success"
                    >
                      验证连接
                    </button>
                  </div>
                  {validationMessages[agent.envKey] && (
                    <p className="text-[10px] text-text-secondary">{validationMessages[agent.envKey]}</p>
                  )}
                </div>
              )}
              <p className="text-[10px] text-text-muted mt-1.5 leading-relaxed">
                密钥保存在 macOS 钥匙串，保存后界面不会回显。
              </p>
            </Section>
          )}

          {/* 命令 */}
          <Section title="命令参考">
            {[
              ["安装", agent.installCommand],
              ["修复", agent.repairCommand],
              ["检测", agent.checkCommand],
              ["执行", agent.runCommand?.replace("{{prompt}}", '"你的问题"')],
            ]
              .filter(([, c]) => c)
              .map(([label, cmd]) => (
                <div key={label as string} className="mb-2">
                  <p className="text-[10px] text-text-muted mb-1">{label}</p>
                  <code className="block bg-bg-tertiary rounded-lg p-2 text-[10px] font-mono text-text-secondary break-all">
                    {cmd}
                  </code>
                </div>
              ))}
          </Section>

          {/* 日志 */}
          <Section title={`执行日志（${logs.length}）`}>
            {logs.length === 0 ? (
              <p className="text-[11px] text-text-muted">暂无记录</p>
            ) : (
              logs.map((r) => (
                <div key={r.id} className="mb-2 bg-bg-tertiary/60 rounded-lg p-2.5">
                  <div className="flex items-center gap-1.5">
                    {r.ok ? (
                      <CheckCircle2 className="w-3 h-3 text-success shrink-0" />
                    ) : (
                      <XCircle className="w-3 h-3 text-danger shrink-0" />
                    )}
                    <span className="text-[10px] font-medium flex-1 truncate">{r.label}</span>
                    <span className="text-[9px] text-text-muted">
                      {(r.durationMs / 1000).toFixed(1)}s
                    </span>
                  </div>
                  {r.output && (
                    <pre className="mt-1.5 text-[9px] font-mono text-text-muted whitespace-pre-wrap break-all max-h-24 overflow-y-auto">
                      {r.output.slice(0, 800)}
                    </pre>
                  )}
                </div>
              ))
            )}
          </Section>
        </div>
      </div>
    </div>
  );
}

function ActionBtn({
  children,
  onClick,
  danger,
  tone,
}: {
  children: React.ReactNode;
  onClick: () => void;
  danger?: boolean;
  tone?: "warning" | "success";
}) {
  const cls = danger
    ? "text-danger hover:bg-danger/10 border-danger/30"
    : tone === "warning"
      ? "text-warning bg-warning/10 border-warning/30 hover:bg-warning/20"
      : tone === "success"
        ? "text-white bg-success border-success hover:bg-success/85"
        : "text-text-secondary hover:text-text-primary bg-bg-card border-border hover:border-border-hover";
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 text-xs border px-3 py-2 rounded-lg transition-colors ${cls}`}
    >
      {children}
    </button>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-bg-card border border-border rounded-xl p-3.5">
      <h4 className="text-xs font-semibold mb-2.5">{title}</h4>
      {children}
    </div>
  );
}

function Row({ label, value, mono, children }: { label: string; value?: string; mono?: boolean; children?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1">
      <span className="text-[11px] text-text-muted shrink-0">{label}</span>
      {children ?? (
        <span className={`text-[11px] text-right truncate ${mono ? "font-mono" : ""}`}>{value ?? "-"}</span>
      )}
    </div>
  );
}
