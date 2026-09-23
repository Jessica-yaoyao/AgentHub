# 当前状态

AgentHub v0.5.0 是 macOS 桌面端多 Agent 工作台，以项目工作目录和独立任务会话组织工作。

已在本机使用 Kimi Code API 的 `kimi-for-coding` 验证 Kimi Code、Codex、Claude Code 和 Pi 的真实任务调用、计划阶段只读约束、确认后执行、运行中停止以及重启后会话恢复。Kimi 原生 Web 界面嵌入主窗口，支持原生思考状态和审批。测试中的文件写入仅发生在隔离临时目录。

Gemini CLI、Qwen Code、Cursor Agent、OpenCode、Aider 和 OpenClaw 提供安装管理和对应入口，但仍需要逐一完成本机安装、授权与端到端验证。Cursor 的窗口只读计划约束尚未验证，因此该模式会明确拒绝运行。

当前限制：系统桌面通知未接入；自动化任务采用独立执行路径，尚未共享交互任务的完整审批体验；不同 Agent 的会话不能直接互换。Kimi 本地服务接口属于官方实验性接口，升级后需要重新验证。

开发者可运行 `npm test`、`npm run build` 和 `cargo test --manifest-path src-tauri/Cargo.toml`。真实 API 测试脚本位于 `runtime/`，会从 macOS 钥匙串读取密钥并使用系统临时目录；运行前请自行确认 API 额度。
