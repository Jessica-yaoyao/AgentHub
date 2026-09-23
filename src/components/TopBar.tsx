import { useAppStore } from "../store/appStore";
import { runningInTauri } from "../lib/bridge";
import {
  PanelLeft,
  ArrowLeft,
  ArrowRight,
  CircleHelp,
  SquareTerminal,
  RefreshCw,
  Loader2,
  MonitorSmartphone,
  Globe,
} from "lucide-react";

/** 顶栏：窗口导航 + 视图操作（ZCode 风格） */
export function TopBar() {
  const {
    toggleSidebar,
    goBack,
    goForward,
    navBack,
    navForward,
    terminalOpen,
    setTerminalOpen,
    detecting,
    refreshDetection,
    lastDetectedAt,
  } = useAppStore();

  return (
    <div className="h-11 flex items-center gap-1 px-3 shrink-0 border-b border-border bg-bg-primary drag-region">
      <button
        onClick={toggleSidebar}
        className="p-1.5 rounded-md text-text-muted hover:text-text-primary hover:bg-bg-hover transition-colors"
        title="切换侧边栏 ⌘B"
      >
        <PanelLeft className="w-4 h-4" />
      </button>
      <button
        onClick={goBack}
        disabled={navBack.length === 0}
        className="p-1.5 rounded-md text-text-muted hover:text-text-primary hover:bg-bg-hover transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
        title="后退"
      >
        <ArrowLeft className="w-4 h-4" />
      </button>
      <button
        onClick={goForward}
        disabled={navForward.length === 0}
        className="p-1.5 rounded-md text-text-muted hover:text-text-primary hover:bg-bg-hover transition-colors disabled:opacity-30 disabled:hover:bg-transparent"
        title="前进"
      >
        <ArrowRight className="w-4 h-4" />
      </button>

      <div className="flex-1" />

      <span
        className={`hidden md:flex items-center gap-1 text-[10px] px-2 py-1 rounded-full border mr-1 ${
          runningInTauri()
            ? "border-success/30 text-success bg-success/5"
            : "border-warning/30 text-warning bg-warning/5"
        }`}
        title={
          runningInTauri()
            ? `桌面端：命令真实执行${lastDetectedAt ? ` · 检测于 ${new Date(lastDetectedAt).toLocaleTimeString("zh-CN")}` : ""}`
            : "浏览器预览：命令为模拟执行"
        }
      >
        {runningInTauri() ? <MonitorSmartphone className="w-3 h-3" /> : <Globe className="w-3 h-3" />}
        {runningInTauri() ? "桌面端" : "预览模式"}
      </span>

      <button
        onClick={() => void refreshDetection()}
        disabled={detecting}
        className="p-1.5 rounded-md text-text-muted hover:text-text-primary hover:bg-bg-hover transition-colors disabled:opacity-50"
        title="重新检测本机 Agent"
      >
        {detecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
      </button>
      <button
        className="p-1.5 rounded-md text-text-muted hover:text-text-primary hover:bg-bg-hover transition-colors"
        title="帮助"
      >
        <CircleHelp className="w-4 h-4" />
      </button>
      <button
        onClick={() => setTerminalOpen(!terminalOpen)}
        className={`p-1.5 rounded-md transition-colors ${
          terminalOpen
            ? "text-accent-light bg-accent/10"
            : "text-text-muted hover:text-text-primary hover:bg-bg-hover"
        }`}
        title="切换终端"
      >
        <SquareTerminal className="w-4 h-4" />
      </button>
    </div>
  );
}
