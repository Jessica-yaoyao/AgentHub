export const WORKSPACES: Record<
  string,
  {
    name: string;
    accent: string;
    surface: string;
    description: string;
    docs: string;
    features: string[];
    limits?: string;
  }
> = {
  "kimi-code": {
    name: "Kimi Code",
    accent: "#a3e635",
    surface: "#10130e",
    description: "原生工作区 · 思考、计划与执行",
    docs: "https://www.kimi.com/code/docs/kimi-code-cli/guides/web.html",
    features: [
      "原生 Web",
      "计划审批",
      "思考状态",
      "文件与修改",
      "工具与子任务",
      "会话恢复",
    ],
  },
  codex: {
    name: "Codex",
    accent: "#b6c8df",
    surface: "#14171b",
    description: "项目工作区 · 计划、工具与修改审阅",
    docs: "https://learn.chatgpt.com/docs/app-server",
    features: [
      "原生会话",
      "只读计划",
      "工具审批",
      "修改对比",
      "模型切换",
      "中断恢复",
    ],
  },
  "claude-code": {
    name: "Claude Code",
    accent: "#d97757",
    surface: "#201c19",
    description: "工程协作 · 从理解到实现",
    docs: "https://code.claude.com/docs/en/headless",
    features: ["连续会话", "原生计划", "实时回答", "工具状态", "模型选择"],
    limits:
      "已接入官方授权与提问。为保持计划约束，窗口不自动载入自定义扩展或项目钩子；可在官方终端使用。",
  },
  "pi-coding": {
    name: "Pi",
    accent: "#d2b0fa",
    surface: "#191622",
    description: "简洁而可控 · 模型与工具自由组合",
    docs: "https://pi.dev/docs/latest/rpc",
    features: ["原生会话", "只读工具计划", "思考状态", "模型切换", "中断恢复"],
    limits:
      "Pi 没有内置计划审批。本窗口以只读工具限制实现计划；扩展默认不载入。",
  },
  "gemini-cli": {
    name: "Gemini CLI",
    accent: "#84abff",
    surface: "#131b2a",
    description: "探索与构建 · 多模态工作区",
    docs: "https://geminicli.com/docs/cli/headless/",
    features: ["连续会话", "原生计划", "实时输出", "工具状态"],
    limits: "需安装并完成 Google 授权，具体能力以本机版本为准。",
  },
  "qwen-code": {
    name: "Qwen Code",
    accent: "#b09aff",
    surface: "#1c1728",
    description: "中文工程协作 · 计划与代码",
    docs: "https://qwenlm.github.io/qwen-code-docs/en/users/features/headless/",
    features: ["连续会话", "原生计划", "实时输出", "模型切换"],
    limits: "需安装与有效授权，具体能力以本机版本为准。",
  },
  "cursor-agent": {
    name: "Cursor",
    accent: "#ececec",
    surface: "#161616",
    description: "编辑器协作 · Agent 工作区",
    docs: "https://cursor.com/docs/cli/reference/output-format",
    features: ["实时输出", "工具状态", "连续会话", "官方终端"],
    limits:
      "官方非交互输出不包含思考事件；窗口计划约束尚未验证，计划请在官方终端使用。",
  },
  opencode: {
    name: "OpenCode",
    accent: "#e6e6e6",
    surface: "#141414",
    description: "原生网页 · 多服务商编程工作区",
    docs: "https://opencode.ai/docs/web/",
    features: ["原生 Web", "多服务商", "会话管理", "文件与工具"],
    limits: "需要本机安装 OpenCode，并在原生界面完成授权。",
  },
  aider: {
    name: "Aider",
    accent: "#9bdd6d",
    surface: "#172014",
    description: "结对编程 · 仓库与修改",
    docs: "https://aider.chat/docs/usage/browser.html",
    features: ["官方实验性 Web", "仓库地图", "多模型", "修改审阅"],
    limits: "网页界面为官方实验功能；本窗口启动时关闭自动提交。",
  },
  openclaw: {
    name: "OpenClaw",
    accent: "#ff796b",
    surface: "#241815",
    description: "原生控制台 · 会话与自动化",
    docs: "https://docs.openclaw.ai/web/control-ui",
    features: ["原生控制台", "会话", "技能", "自动化"],
    limits: "需先完成 Gateway 配置和设备配对；本应用不会自动启动外部消息通道。",
  },
};
