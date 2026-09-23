import { create } from "zustand";
import { persist } from "zustand/middleware";
import type {
  Agent,
  AgentRuntime,
  AutomationItem,
  ChatMessage,
  NavEntry,
  Project,
  RunRecord,
  SystemInfo,
  Task,
  TaskMode,
  View,
} from "../types/models";
import { BUILTIN_AGENTS } from "../data/agents";
import * as bridge from "../lib/bridge";
import {
  busy,
  NATIVE_AGENTS,
  useWorkspaceStore,
  workspaceRequest,
  type WorkspaceEvent,
} from "../lib/workspace";

const now = () => new Date().toISOString();
const uid = (p: string) =>
  `${p}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

function shellEscapePrompt(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\$/g, "\\$")
    .replace(/`/g, "\\`")
    .replace(/\n/g, " ");
}

interface AppStore {
  // ---- 导航 ----
  view: View;
  selectedTaskId: string | null;
  navBack: NavEntry[];
  navForward: NavEntry[];
  navigate: (view: View, taskId?: string | null) => void;
  goBack: () => void;
  goForward: () => void;
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  sidebarTab: "group" | "project";
  setSidebarTab: (t: "group" | "project") => void;
  paletteOpen: boolean;
  setPaletteOpen: (open: boolean) => void;
  terminalOpen: boolean;
  setTerminalOpen: (open: boolean) => void;
  agentDrawerId: string | null;
  setAgentDrawer: (id: string | null) => void;
  settingsAnchor: string;
  setSettingsAnchor: (a: string) => void;

  // ---- Agent 与运行时检测 ----
  agents: Agent[];
  runtimes: Record<string, AgentRuntime>;
  detecting: boolean;
  lastDetectedAt: string | null;
  refreshDetection: () => Promise<void>;
  installAgent: (id: string) => Promise<void>;
  uninstallAgent: (id: string) => Promise<void>;
  repairAgent: (id: string) => Promise<void>;
  launchInteractive: (id: string, cwd?: string) => Promise<string>;
  openDesktop: (id: string) => Promise<string>;
  launchKimiWeb: () => Promise<string>;

  // ---- 项目 ----
  projects: Project[];
  addProject: (path?: string) => Promise<Project | null>;
  removeProject: (id: string) => void;

  // ---- 任务 ----
  tasks: Task[];
  createTask: (opts?: {
    projectId?: string;
    agentId?: string;
    mode?: TaskMode;
  }) => string;
  selectTask: (id: string) => void;
  removeTask: (id: string) => void;
  setTaskAgent: (taskId: string, agentId: string) => void;
  setTaskMode: (taskId: string, mode: TaskMode) => void;
  sendTaskMessage: (taskId: string, text: string) => Promise<void>;
  setTaskConnection: (
    taskId: string,
    patch: Partial<Pick<Task, "provider" | "model" | "theme">>,
  ) => void;
  handleWorkspaceEvent: (event: WorkspaceEvent) => void;

  // ---- 自动化 ----
  automations: AutomationItem[];
  createAutomation: (
    a: Omit<AutomationItem, "id" | "createdAt" | "lastRunAt" | "lastResult">,
  ) => void;
  toggleAutomation: (id: string, enabled: boolean) => void;
  removeAutomation: (id: string) => void;
  runAutomationNow: (id: string) => Promise<void>;
  checkAutomations: () => Promise<void>;
  automationRunning: string | null;

  // ---- 日志 ----
  runRecords: RunRecord[];
  addRunRecord: (r: RunRecord) => void;
  clearRunRecords: () => void;

  // ---- 系统信息 ----
  systemInfo: SystemInfo | null;
  loadSystemInfo: () => Promise<void>;

  // ---- 设置 ----
  /** 仅用于从旧版明文存储迁移，初始化后会被清空且不再持久化 */
  apiKeys: Record<string, string>;
  apiKeyStatus: Record<string, boolean>;
  initializeSecrets: () => Promise<void>;
  saveApiKey: (envKey: string, value: string) => Promise<void>;
  removeApiKey: (envKey: string) => Promise<void>;
  availableModels: Record<string, string[]>;
  selectedModels: Record<string, string>;
  modelLoading: Record<string, boolean>;
  modelErrors: Record<string, string | undefined>;
  validationMessages: Record<string, string | undefined>;
  refreshModels: (envKey: string) => Promise<void>;
  refreshAllModels: () => Promise<void>;
  setSelectedModel: (envKey: string, model: string) => void;
  validateApiKey: (envKey: string) => Promise<void>;
  prefs: {
    notifications: boolean;
    keepAwake: boolean;
    autoUpdate: boolean;
    safeMode: boolean;
  };
  setPref: (key: keyof AppStore["prefs"], value: boolean) => void;
  resetAllData: () => void;
}

export const useAppStore = create<AppStore>()(
  persist(
    (set, get) => {
      /** 执行任务/自动化 prompt 的核心执行器 */
      const runAgentPrompt = async (
        agent: Agent,
        prompt: string,
        cwd: string | undefined,
        label: string,
      ): Promise<{
        ok: boolean;
        output: string;
        durationMs: number;
        real: boolean;
      }> => {
        const t0 = Date.now();
        const selectedModel = agent.envKey
          ? (get().selectedModels[agent.envKey] ?? agent.defaultModel)
          : undefined;
        const canCallKimiApi =
          bridge.runningInTauri() &&
          agent.modelProvider === "kimi" &&
          Boolean(agent.envKey && get().apiKeyStatus[agent.envKey]) &&
          Boolean(selectedModel);
        const canReallyRun =
          bridge.runningInTauri() &&
          agent.promptMode === "print" &&
          agent.runCommand;

        if (
          (canCallKimiApi && agent.envKey && selectedModel) ||
          (canReallyRun && agent.runCommand)
        ) {
          const usingApi =
            canCallKimiApi && Boolean(agent.envKey && selectedModel);
          const command = usingApi
            ? `Kimi Code API · ${selectedModel}`
            : agent.runCommand!.replace(
                "{{prompt}}",
                shellEscapePrompt(prompt),
              );
          const result = usingApi
            ? await bridge.runApiPrompt(agent.envKey!, selectedModel!, prompt)
            : await bridge.runAgentCommand(command, cwd, 300, agent.envKey);
          const output = result.ok
            ? result.stdout || "(无输出)"
            : `执行失败（退出码 ${result.code}）：\n${result.stderr || result.stdout}`;
          get().addRunRecord({
            id: uid("run"),
            label,
            command,
            output,
            ok: result.ok,
            startedAt: new Date(t0).toISOString(),
            durationMs: Date.now() - t0,
          });
          return {
            ok: result.ok,
            output,
            durationMs: Date.now() - t0,
            real: true,
          };
        }

        const reason = !bridge.runningInTauri()
          ? "浏览器预览模式"
          : agent.promptMode !== "print"
            ? `${agent.displayName} 仅支持交互模式，请在终端中打开使用`
            : "未配置运行命令";
        const output = `未执行：${reason}。请在桌面工作区或官方终端中运行。`;
        get().addRunRecord({
          id: uid("run"),
          label,
          command: agent.runCommand || agent.name,
          output,
          ok: false,
          startedAt: new Date(t0).toISOString(),
          durationMs: Date.now() - t0,
        });
        return { ok: false, output, durationMs: Date.now() - t0, real: false };
      };

      /** 应用检测结果 */
      const applyDetection = async () => {
        const { agents, apiKeyStatus } = get();
        const cliResults = await bridge.detectAllAgents(
          agents.map((a) => ({ agentId: a.id, checkCommand: a.checkCommand })),
        );
        const desktopResults = await bridge.detectDesktopApps(
          agents
            .filter((a) => a.desktopAppNames?.length)
            .map((a) => ({ agentId: a.id, names: a.desktopAppNames! })),
        );
        // 登录态：聚合全部 authFiles 一次性检查
        const allAuthPaths = [
          ...new Set(agents.flatMap((a) => a.authFiles ?? [])),
        ];
        const exists = allAuthPaths.length
          ? await bridge.checkFilesExist(allAuthPaths)
          : [];

        const runtimes: Record<string, AgentRuntime> = {};
        for (const agent of agents) {
          const cli = cliResults.find((r) => r.agentId === agent.id);
          const desktop = desktopResults.find((r) => r.agentId === agent.id);
          const loggedIn = (agent.authFiles ?? []).some(
            (p) => exists[allAuthPaths.indexOf(p)],
          );
          const auth: AgentRuntime["auth"] = loggedIn
            ? "logged-in"
            : agent.envKey && apiKeyStatus[agent.envKey]
              ? "api-key"
              : agent.apiKeyRequired
                ? "none"
                : "unknown";
          runtimes[agent.id] = {
            cliStatus: cli?.status ?? "missing",
            cliVersion: cli?.version,
            cliPath: cli?.path,
            cliError: cli?.error,
            desktopInstalled: desktop?.installed ?? false,
            desktopVersion: desktop?.version,
            desktopPath: desktop?.appPath,
            auth,
          };
        }
        set({ runtimes, lastDetectedAt: now() });
      };

      const ensureDefaultProject = (): string => {
        const { projects } = get();
        if (projects.length > 0) return projects[0].id;
        const p: Project = {
          id: uid("proj"),
          name: "默认项目",
          path: "~",
          createdAt: now(),
        };
        set({ projects: [p] });
        return p.id;
      };

      const projectPath = (projectId: string): string | undefined => {
        const p = get().projects.find((x) => x.id === projectId);
        return p?.path;
      };

      return {
        // ---- 导航 ----
        view: "home",
        selectedTaskId: null,
        navBack: [],
        navForward: [],
        navigate: (view, taskId = null) =>
          set((s) => ({
            view,
            selectedTaskId: taskId,
            navBack: [
              ...s.navBack,
              { view: s.view, taskId: s.selectedTaskId },
            ].slice(-50),
            navForward: [],
          })),
        goBack: () =>
          set((s) => {
            const prev = s.navBack[s.navBack.length - 1];
            if (!prev) return s;
            return {
              view: prev.view,
              selectedTaskId: prev.taskId ?? null,
              navBack: s.navBack.slice(0, -1),
              navForward: [
                ...s.navForward,
                { view: s.view, taskId: s.selectedTaskId },
              ],
            };
          }),
        goForward: () =>
          set((s) => {
            const next = s.navForward[s.navForward.length - 1];
            if (!next) return s;
            return {
              view: next.view,
              selectedTaskId: next.taskId ?? null,
              navForward: s.navForward.slice(0, -1),
              navBack: [
                ...s.navBack,
                { view: s.view, taskId: s.selectedTaskId },
              ],
            };
          }),
        sidebarCollapsed: false,
        toggleSidebar: () =>
          set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
        sidebarTab: "project",
        setSidebarTab: (t) => set({ sidebarTab: t }),
        paletteOpen: false,
        setPaletteOpen: (open) => set({ paletteOpen: open }),
        terminalOpen: false,
        setTerminalOpen: (open) => set({ terminalOpen: open }),
        agentDrawerId: null,
        setAgentDrawer: (id) => set({ agentDrawerId: id }),
        settingsAnchor: "agents",
        setSettingsAnchor: (a) => set({ settingsAnchor: a }),

        // ---- Agent 与检测 ----
        agents: BUILTIN_AGENTS,
        runtimes: {},
        detecting: false,
        lastDetectedAt: null,
        refreshDetection: async () => {
          set({ detecting: true });
          try {
            await applyDetection();
          } finally {
            set({ detecting: false });
          }
        },

        installAgent: async (id) => {
          const agent = get().agents.find((a) => a.id === id);
          if (!agent?.installCommand) return;
          set((s) => ({
            runtimes: {
              ...s.runtimes,
              [id]: {
                ...emptyRuntime(),
                ...s.runtimes[id],
                cliStatus: "checking",
              },
            },
          }));
          const t0 = Date.now();
          const result = await bridge.installAgentCommand(agent.installCommand);
          get().addRunRecord({
            id: uid("run"),
            label: `安装 ${agent.displayName}`,
            command: agent.installCommand,
            output: result.stdout || result.stderr,
            ok: result.ok,
            startedAt: new Date(t0).toISOString(),
            durationMs: Date.now() - t0,
          });
          await applyDetection();
        },

        uninstallAgent: async (id) => {
          const agent = get().agents.find((a) => a.id === id);
          if (!agent?.uninstallCommand) return;
          const t0 = Date.now();
          const result = await bridge.uninstallAgentCommand(
            agent.uninstallCommand,
            agent.name,
          );
          get().addRunRecord({
            id: uid("run"),
            label: `卸载 ${agent.displayName}`,
            command: agent.uninstallCommand,
            output: result.stdout || result.stderr,
            ok: result.ok,
            startedAt: new Date(t0).toISOString(),
            durationMs: Date.now() - t0,
          });
          await applyDetection();
        },

        repairAgent: async (id) => {
          const agent = get().agents.find((a) => a.id === id);
          if (!agent?.repairCommand) return;
          set((s) => ({
            runtimes: {
              ...s.runtimes,
              [id]: {
                ...emptyRuntime(),
                ...s.runtimes[id],
                cliStatus: "checking",
              },
            },
          }));
          const t0 = Date.now();
          const result = await bridge.installAgentCommand(agent.repairCommand);
          get().addRunRecord({
            id: uid("run"),
            label: `修复 ${agent.displayName}`,
            command: agent.repairCommand,
            output: result.stdout || result.stderr,
            ok: result.ok,
            startedAt: new Date(t0).toISOString(),
            durationMs: Date.now() - t0,
          });
          await applyDetection();
        },

        launchInteractive: async (id, cwd) => {
          const agent = get().agents.find((a) => a.id === id);
          if (!agent) return "Agent 不存在";
          return bridge.launchInTerminal(agent.name, cwd);
        },

        openDesktop: async (id) => {
          const rt = get().runtimes[id];
          if (!rt?.desktopPath) return "未检测到桌面客户端";
          return bridge.openDesktopApp(rt.desktopPath);
        },
        launchKimiWeb: async () => {
          get().setAgentDrawer(null);
          get().createTask({ agentId: "kimi-code" });
          return "已在主窗口打开 Kimi 原生工作区";
        },

        // ---- 项目 ----
        projects: [],
        addProject: async (path) => {
          const chosen = path ?? (await bridge.pickFolder());
          if (!chosen) return null;
          const name = chosen.split("/").filter(Boolean).pop() || chosen;
          const p: Project = {
            id: uid("proj"),
            name,
            path: chosen,
            createdAt: now(),
          };
          set((s) => ({ projects: [...s.projects, p] }));
          return p;
        },
        removeProject: (id) =>
          set((s) => ({
            projects: s.projects.filter((p) => p.id !== id),
            tasks: s.tasks.filter((t) => t.projectId !== id),
          })),

        // ---- 任务 ----
        tasks: [],
        createTask: (opts) => {
          const projectId = opts?.projectId ?? ensureDefaultProject();
          const readyAgent = get().agents.find((a) => {
            const rt = get().runtimes[a.id];
            return rt?.cliStatus === "installed" && a.promptMode === "print";
          });
          const agentId = opts?.agentId ?? readyAgent?.id ?? get().agents[0].id;
          const task: Task = {
            id: uid("task"),
            projectId,
            agentId,
            provider: agentId === "kimi-code" ? "kimi" : "native",
            model:
              agentId === "kimi-code"
                ? get().selectedModels.MOONSHOT_API_KEY || "kimi-for-coding"
                : undefined,
            title: "新任务",
            mode: opts?.mode ?? "plan",
            status: "running",
            messages: [],
            createdAt: now(),
            updatedAt: now(),
          };
          set((s) => ({ tasks: [task, ...s.tasks] }));
          get().navigate("task", task.id);
          return task.id;
        },
        selectTask: (id) => get().navigate("task", id),
        removeTask: (id) =>
          set((s) => ({
            tasks: s.tasks.filter((t) => t.id !== id),
            selectedTaskId: s.selectedTaskId === id ? null : s.selectedTaskId,
            view: s.selectedTaskId === id ? "home" : s.view,
          })),
        setTaskAgent: (taskId, agentId) => {
          const task = get().tasks.find((t) => t.id === taskId);
          if (task && task.agentId !== agentId)
            get().createTask({
              projectId: task.projectId,
              agentId,
              mode: task.mode,
            });
        },
        setTaskMode: (taskId, mode) => {
          if (busy(useWorkspaceStore.getState().states[taskId])) return;
          set((s) => ({
            tasks: s.tasks.map((t) =>
              t.id === taskId ? { ...t, mode, updatedAt: now() } : t,
            ),
          }));
        },
        setTaskConnection: (taskId, patch) => {
          if (busy(useWorkspaceStore.getState().states[taskId])) return;
          set((s) => ({
            tasks: s.tasks.map((t) =>
              t.id === taskId ? { ...t, ...patch } : t,
            ),
          }));
        },
        handleWorkspaceEvent: (event) => {
          useWorkspaceStore.getState().apply(event);
          const task = get().tasks.find((t) => t.id === event.taskId);
          if (task && event.kind === "nativeStatus") {
            const status = event.busy
              ? "running"
              : event.failed
                ? "error"
                : "done";
            if (
              task.mode !== event.mode ||
              task.status !== status ||
              (event.title && event.title !== task.title)
            )
              set((s) => ({
                tasks: s.tasks.map((t) =>
                  t.id === event.taskId
                    ? {
                        ...t,
                        mode: event.mode || t.mode,
                        status,
                        title: event.title || t.title,
                        updatedAt: event.updatedAt || t.updatedAt,
                      }
                    : t,
                ),
              }));
          }
          if (!task || NATIVE_AGENTS.has(task.agentId)) return;
          if (event.kind === "text")
            set((s) => ({
              tasks: s.tasks.map((t) =>
                t.id === event.taskId
                  ? {
                      ...t,
                      messages: t.messages.map((m, i) =>
                        i === t.messages.length - 1 && m.role === "assistant"
                          ? { ...m, content: m.content + (event.delta || "") }
                          : m,
                      ),
                    }
                  : t,
              ),
            }));
          if (event.kind === "complete")
            set((s) => ({
              tasks: s.tasks.map((t) =>
                t.id === event.taskId
                  ? {
                      ...t,
                      status: event.ok ? "done" : "error",
                      updatedAt: now(),
                      messages: t.messages.map((m, i) =>
                        i === t.messages.length - 1 && m.role === "assistant"
                          ? {
                              ...m,
                              content:
                                m.content || event.error || "(没有文本输出)",
                              durationMs:
                                Date.now() -
                                (useWorkspaceStore.getState().states[t.id]
                                  ?.startedAt || Date.now()),
                            }
                          : m,
                      ),
                    }
                  : t,
              ),
            }));
        },

        sendTaskMessage: async (taskId, text) => {
          const task = get().tasks.find((t) => t.id === taskId);
          if (
            !task ||
            !text.trim() ||
            busy(useWorkspaceStore.getState().states[taskId])
          )
            return;
          const agent = get().agents.find((a) => a.id === task.agentId);
          if (!agent) return;

          useWorkspaceStore.getState().patch(taskId, {
            phase: "working",
            startedAt: Date.now(),
            currentText: "",
            tools: [],
            approvals: {},
            diff: undefined,
            steps: undefined,
            detail: "正在连接 Agent",
          });

          const userMsg: ChatMessage = {
            id: uid("msg"),
            role: "user",
            content: text,
            timestamp: now(),
          };
          set((s) => ({
            tasks: s.tasks.map((t) =>
              t.id === taskId
                ? {
                    ...t,
                    title:
                      t.messages.length === 0 ? text.slice(0, 24) : t.title,
                    messages: [
                      ...t.messages,
                      userMsg,
                      ...(!NATIVE_AGENTS.has(agent.id)
                        ? [
                            {
                              id: uid("msg"),
                              role: "assistant" as const,
                              content: "",
                              timestamp: now(),
                              real: true,
                            },
                          ]
                        : []),
                    ],
                    updatedAt: now(),
                  }
                : t,
            ),
          }));

          const cwd = projectPath(task.projectId);
          try {
            await workspaceRequest("send", {
              taskId,
              agentId: agent.id,
              cwd,
              mode: task.mode,
              provider:
                task.provider || (agent.id === "kimi-code" ? "kimi" : "native"),
              model:
                task.model ||
                (agent.id === "kimi-code"
                  ? get().selectedModels.MOONSHOT_API_KEY || "kimi-for-coding"
                  : undefined),
              text,
            });
          } catch (e) {
            get().handleWorkspaceEvent({
              taskId,
              kind: "complete",
              ok: false,
              error: String(e),
            });
            useWorkspaceStore
              .getState()
              .patch(taskId, { phase: "error", detail: String(e) });
          }
        },

        // ---- 自动化 ----
        automations: [],
        createAutomation: (a) =>
          set((s) => ({
            automations: [
              { ...a, id: uid("auto"), createdAt: now() },
              ...s.automations,
            ],
          })),
        toggleAutomation: (id, enabled) =>
          set((s) => ({
            automations: s.automations.map((a) =>
              a.id === id ? { ...a, enabled } : a,
            ),
          })),
        removeAutomation: (id) =>
          set((s) => ({
            automations: s.automations.filter((a) => a.id !== id),
          })),

        runAutomationNow: async (id) => {
          const automation = get().automations.find((a) => a.id === id);
          if (!automation || get().automationRunning) return;
          const agent = get().agents.find((a) => a.id === automation.agentId);
          if (!agent) return;
          set({ automationRunning: id });
          try {
            const cwd = projectPath(automation.projectId);
            const result = await runAgentPrompt(
              agent,
              automation.prompt,
              cwd,
              `自动化「${automation.name}」`,
            );
            set((s) => ({
              automations: s.automations.map((a) =>
                a.id === id
                  ? {
                      ...a,
                      lastRunAt: now(),
                      lastResult: result.output.slice(0, 2000),
                      lastOk: result.ok,
                    }
                  : a,
              ),
            }));
          } finally {
            set({ automationRunning: null });
          }
        },

        checkAutomations: async () => {
          const { automations } = get();
          const nowDate = new Date();
          for (const a of automations) {
            if (!a.enabled || a.schedule.kind === "idle") continue;
            if (isDue(a, nowDate)) {
              await get().runAutomationNow(a.id);
            }
          }
        },
        automationRunning: null,

        // ---- 日志 ----
        runRecords: [],
        addRunRecord: (r) =>
          set((s) => ({ runRecords: [r, ...s.runRecords].slice(0, 200) })),
        clearRunRecords: () => set({ runRecords: [] }),

        // ---- 系统信息 ----
        systemInfo: null,
        loadSystemInfo: async () => {
          set({ systemInfo: await bridge.getSystemInfo() });
        },

        // ---- 设置 ----
        apiKeys: {},
        apiKeyStatus: {},
        initializeSecrets: async () => {
          const keys = [
            ...new Set(
              get().agents.flatMap((a) => (a.envKey ? [a.envKey] : [])),
            ),
          ];
          const legacy = get().apiKeys;
          const legacyValues = Object.values(legacy).filter(Boolean);
          if (bridge.runningInTauri()) {
            for (const [key, value] of Object.entries(legacy)) {
              if (value.trim()) await bridge.saveApiKey(key, value);
            }
          }
          const sanitizedRecords = get().runRecords.map((record) => ({
            ...record,
            command: legacyValues.reduce(
              (text, secret) => text.split(secret).join("***"),
              record.command,
            ),
            output: legacyValues.reduce(
              (text, secret) => text.split(secret).join("***"),
              record.output,
            ),
          }));
          try {
            localStorage.removeItem("agenthub.store.v2");
          } catch {
            // ignore
          }
          set({ apiKeys: {}, runRecords: sanitizedRecords });
          const status = await bridge.getApiKeyStatus(keys);
          set({ apiKeyStatus: status });
        },
        saveApiKey: async (envKey, value) => {
          await bridge.saveApiKey(envKey, value);
          set((s) => ({
            apiKeyStatus: { ...s.apiKeyStatus, [envKey]: true },
            validationMessages: {
              ...s.validationMessages,
              [envKey]: undefined,
            },
          }));
          await get().refreshModels(envKey);
          await applyDetection();
        },
        removeApiKey: async (envKey) => {
          await bridge.deleteApiKey(envKey);
          set((s) => ({
            apiKeyStatus: { ...s.apiKeyStatus, [envKey]: false },
            availableModels: { ...s.availableModels, [envKey]: [] },
            validationMessages: {
              ...s.validationMessages,
              [envKey]: undefined,
            },
          }));
          await applyDetection();
        },
        availableModels: {},
        selectedModels: { MOONSHOT_API_KEY: "kimi-for-coding" },
        modelLoading: {},
        modelErrors: {},
        validationMessages: {},
        refreshModels: async (envKey) => {
          if (!get().apiKeyStatus[envKey]) return;
          set((s) => ({
            modelLoading: { ...s.modelLoading, [envKey]: true },
            modelErrors: { ...s.modelErrors, [envKey]: undefined },
          }));
          try {
            const models = await bridge.listApiModels(envKey);
            const current = get().selectedModels[envKey];
            const preferred = get().agents.find(
              (a) => a.envKey === envKey && a.defaultModel,
            )?.defaultModel;
            const selected =
              current && models.includes(current)
                ? current
                : preferred && models.includes(preferred)
                  ? preferred
                  : (models[0] ?? "");
            set((s) => ({
              availableModels: { ...s.availableModels, [envKey]: models },
              selectedModels: { ...s.selectedModels, [envKey]: selected },
            }));
          } catch (error) {
            set((s) => ({
              modelErrors: { ...s.modelErrors, [envKey]: String(error) },
            }));
          } finally {
            set((s) => ({
              modelLoading: { ...s.modelLoading, [envKey]: false },
            }));
          }
        },
        refreshAllModels: async () => {
          const keys = [
            ...new Set(
              get()
                .agents.filter(
                  (a) =>
                    a.modelProvider && a.envKey && get().apiKeyStatus[a.envKey],
                )
                .map((a) => a.envKey!),
            ),
          ];
          await Promise.all(keys.map((key) => get().refreshModels(key)));
        },
        setSelectedModel: (envKey, model) =>
          set((s) => ({
            selectedModels: { ...s.selectedModels, [envKey]: model },
          })),
        validateApiKey: async (envKey) => {
          set((s) => ({
            validationMessages: {
              ...s.validationMessages,
              [envKey]: "正在验证...",
            },
          }));
          try {
            const result = await bridge.validateApiKey(
              envKey,
              get().selectedModels[envKey],
            );
            set((s) => ({
              validationMessages: {
                ...s.validationMessages,
                [envKey]: result.message,
              },
            }));
          } catch (error) {
            set((s) => ({
              validationMessages: {
                ...s.validationMessages,
                [envKey]: `验证失败：${String(error)}`,
              },
            }));
          }
        },
        prefs: {
          notifications: true,
          keepAwake: false,
          autoUpdate: true,
          safeMode: true,
        },
        setPref: (key, value) => {
          set((s) => ({ prefs: { ...s.prefs, [key]: value } }));
          if (key === "keepAwake") void bridge.setKeepAwake(value);
        },
        resetAllData: () => {
          bridge.resetMockState();
          const keys = [
            ...new Set(
              get().agents.flatMap((a) => (a.envKey ? [a.envKey] : [])),
            ),
          ];
          void Promise.all(keys.map((key) => bridge.deleteApiKey(key)));
          try {
            localStorage.removeItem("agenthub.store.v2");
          } catch {
            // ignore
          }
          set({
            projects: [],
            tasks: [],
            automations: [],
            runRecords: [],
            apiKeys: {},
            apiKeyStatus: {},
            availableModels: {},
            selectedModels: { MOONSHOT_API_KEY: "kimi-for-coding" },
            modelErrors: {},
            validationMessages: {},
            runtimes: {},
            lastDetectedAt: null,
            selectedTaskId: null,
            view: "home",
            navBack: [],
            navForward: [],
          });
        },
      };
    },
    {
      name: "agenthub.store.v3",
      partialize: (s) => ({
        projects: s.projects,
        tasks: s.tasks,
        automations: s.automations,
        selectedModels: s.selectedModels,
        prefs: s.prefs,
        runRecords: s.runRecords,
        lastDetectedAt: s.lastDetectedAt,
      }),
    },
  ),
);

function emptyRuntime(): AgentRuntime {
  return {
    cliStatus: "checking",
    desktopInstalled: false,
    auth: "unknown",
  };
}

/** 自动化到期判断 */
function isDue(a: AutomationItem, nowDate: Date): boolean {
  const last = a.lastRunAt ? new Date(a.lastRunAt) : new Date(a.createdAt);
  const s = a.schedule;
  if (s.kind === "interval" && s.minutes) {
    return nowDate.getTime() - last.getTime() >= s.minutes * 60_000;
  }
  if ((s.kind === "daily" || s.kind === "weekly") && s.time) {
    const [hh, mm] = s.time.split(":").map(Number);
    const target = new Date(nowDate);
    target.setHours(hh, mm, 0, 0);
    if (nowDate < target) return false; // 今天还没到点
    if (
      s.kind === "weekly" &&
      s.weekday != null &&
      nowDate.getDay() !== s.weekday
    )
      return false;
    // 上次运行在今天目标时间之前 → 到期
    return last < target;
  }
  return false;
}
