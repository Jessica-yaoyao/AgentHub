import { useEffect } from "react";
import { useAppStore } from "./store/appStore";
import { Sidebar } from "./components/Sidebar";
import { TopBar } from "./components/TopBar";
import { SearchPalette } from "./components/SearchPalette";
import { AgentDrawer } from "./components/AgentDrawer";
import { TerminalPanel } from "./components/TerminalPanel";
import { HomeView } from "./views/HomeView";
import { TaskView } from "./views/TaskView";
import { AutomationView } from "./views/AutomationView";
import { MarketView } from "./views/MarketView";
import { SettingsView } from "./views/SettingsView";
import type { WorkspaceEvent } from "./lib/workspace";
import { runningInTauri } from "./lib/bridge";

function App() {
  const {
    view,
    refreshDetection,
    loadSystemInfo,
    setPaletteOpen,
    toggleSidebar,
    createTask,
    checkAutomations,
    terminalOpen,
    initializeSecrets,
    refreshAllModels,
  } = useAppStore();

  // 启动时：检测本机 Agent（CLI + 桌面客户端 + 登录态）+ 系统信息
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let disposed = false;
    void (async () => {
      if (runningInTauri()) {
        const { listen } = await import("@tauri-apps/api/event");
        const off = await listen<WorkspaceEvent>("workspace-event", (e) =>
          useAppStore.getState().handleWorkspaceEvent(e.payload),
        );
        if (disposed) {
          off();
          return;
        }
        unlisten = off;
      }
      await initializeSecrets();
      await Promise.all([refreshDetection(), loadSystemInfo()]);
      await refreshAllModels();
    })();
    return () => {
      disposed = true;
      unlisten?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 自动化调度：每 30 秒检查到期任务
  useEffect(() => {
    const timer = setInterval(() => void checkAutomations(), 30_000);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 快捷键：⌘N 新建任务 / ⌘K 搜索 / ⌘B 侧边栏
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const key = e.key.toLowerCase();
      if (key === "k") {
        e.preventDefault();
        setPaletteOpen(true);
      } else if (key === "n") {
        e.preventDefault();
        createTask();
      } else if (key === "b") {
        e.preventDefault();
        toggleSidebar();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex h-screen w-screen bg-bg-primary text-text-primary overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar />
        <main className="flex-1 overflow-hidden">
          {view === "home" && <HomeView />}
          {view === "task" && <TaskView />}
          {view === "automation" && <AutomationView />}
          {view === "market" && <MarketView />}
          {view === "settings" && <SettingsView />}
        </main>
        {terminalOpen && <TerminalPanel />}
      </div>
      <SearchPalette />
      <AgentDrawer />
    </div>
  );
}

export default App;
