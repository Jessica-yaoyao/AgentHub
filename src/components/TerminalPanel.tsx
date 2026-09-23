import { useEffect, useRef, useState } from "react";
import { useAppStore } from "../store/appStore";
import { runCommand, runningInTauri } from "../lib/bridge";
import { SquareTerminal, RotateCcw, Copy, Loader2, X } from "lucide-react";

interface Line {
  id: number;
  kind: "input" | "stdout" | "stderr" | "info";
  text: string;
}

let lineSeq = 0;
const nextId = () => ++lineSeq;

/** 底部终端面板：桌面端真实执行（登录 shell + PATH 前缀） */
export function TerminalPanel() {
  const { setTerminalOpen, addRunRecord, tasks, selectedTaskId, projects } = useAppStore();
  const [lines, setLines] = useState<Line[]>([
    {
      id: nextId(),
      kind: "info",
      text: runningInTauri()
        ? "AgentHub Shell — 登录 shell 真实执行（PATH 含 ~/.agenthub/npm-global/bin 与 ~/.local/bin）"
        : "AgentHub Shell — 浏览器预览模式，命令为模拟执行",
    },
  ]);
  const [input, setInput] = useState("");
  const [running, setRunning] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const task = tasks.find((t) => t.id === selectedTaskId);
  const cwd = task ? projects.find((p) => p.id === task.projectId)?.path : undefined;

  useEffect(() => {
    scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight);
  }, [lines]);

  useEffect(() => {
    const handler = (e: Event) => {
      const cmd = (e as CustomEvent<string>).detail;
      if (cmd) void execute(cmd);
    };
    window.addEventListener("agenthub:run-command", handler);
    return () => window.removeEventListener("agenthub:run-command", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cwd, running]);

  const append = (items: Omit<Line, "id">[]) =>
    setLines((prev) => [...prev, ...items.map((i) => ({ ...i, id: nextId() }))]);

  const execute = async (raw: string) => {
    const cmd = raw.trim();
    if (!cmd || running) return;
    setInput("");
    append([{ kind: "input", text: cmd }]);
    if (cmd === "clear") {
      setLines([]);
      return;
    }
    setRunning(true);
    const t0 = Date.now();
    try {
      const result = await runCommand(cmd, cwd, 120);
      addRunRecord({
        id: `run-${Date.now()}`,
        label: "终端命令",
        command: cmd,
        output: result.stdout || result.stderr,
        ok: result.ok,
        startedAt: new Date(t0).toISOString(),
        durationMs: Date.now() - t0,
      });
      const out: Omit<Line, "id">[] = [];
      if (result.stdout) out.push({ kind: "stdout", text: result.stdout });
      if (result.stderr) out.push({ kind: "stderr", text: result.stderr });
      if (!result.ok && !result.stderr) out.push({ kind: "stderr", text: `命令失败，退出码 ${result.code}` });
      if (out.length === 0) out.push({ kind: "info", text: "(无输出)" });
      append(out);
    } catch (err) {
      append([{ kind: "stderr", text: `执行出错: ${String(err)}` }]);
    } finally {
      setRunning(false);
      inputRef.current?.focus();
    }
  };

  return (
    <div
      className="h-56 border-t border-border bg-bg-primary flex flex-col shrink-0"
      onClick={() => inputRef.current?.focus()}
    >
      <div className="h-8 bg-bg-tertiary border-b border-border flex items-center px-3 gap-2 shrink-0">
        <SquareTerminal className="w-3.5 h-3.5 text-text-muted" />
        <span className="text-[11px] text-text-muted">终端</span>
        {cwd && <span className="text-[10px] text-text-muted font-mono truncate">{cwd}</span>}
        <div className="flex-1" />
        <button
          onClick={() => setLines([])}
          className="p-1 rounded hover:bg-bg-hover text-text-muted transition-colors"
          title="清屏"
        >
          <RotateCcw className="w-3 h-3" />
        </button>
        <button
          onClick={() => void navigator.clipboard?.writeText(lines.map((l) => l.text).join("\n"))}
          className="p-1 rounded hover:bg-bg-hover text-text-muted transition-colors"
          title="复制全部"
        >
          <Copy className="w-3 h-3" />
        </button>
        <button
          onClick={() => setTerminalOpen(false)}
          className="p-1 rounded hover:bg-bg-hover text-text-muted transition-colors"
          title="关闭"
        >
          <X className="w-3 h-3" />
        </button>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto p-2.5 font-mono text-[11px] leading-relaxed">
        {lines.map((line) => (
          <div
            key={line.id}
            className={
              line.kind === "input"
                ? "text-text-primary"
                : line.kind === "stderr"
                  ? "text-danger"
                  : line.kind === "stdout"
                    ? "text-text-secondary"
                    : "text-text-muted"
            }
          >
            {line.kind === "input" ? (
              <span>
                <span className="text-success">➜</span> <span className="text-text-muted">$</span> {line.text}
              </span>
            ) : (
              <pre className="whitespace-pre-wrap break-all">{line.text}</pre>
            )}
          </div>
        ))}
        {running && (
          <div className="flex items-center gap-1.5 text-text-muted">
            <Loader2 className="w-3 h-3 animate-spin" />
            执行中...
          </div>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          void execute(input);
        }}
        className="border-t border-border p-1.5 bg-bg-secondary shrink-0"
      >
        <div className="flex items-center gap-2 bg-bg-card border border-border rounded-lg px-3 py-1.5 focus-within:border-accent transition-colors">
          <span className="text-success text-[11px] font-mono shrink-0">➜</span>
          <input
            ref={inputRef}
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="输入 shell 命令..."
            className="flex-1 bg-transparent outline-none text-[11px] font-mono text-text-primary placeholder:text-text-muted"
            disabled={running}
          />
        </div>
      </form>
    </div>
  );
}
