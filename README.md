# AgentHub v0.5.0

本机多 Agent 工作台。项目是工作目录，任务是独立会话。简洁的桌面界面帮助用户发现、安装、管理和移除编程 Agent，降低入门门槛。

## 适合谁

想尝试 AI 编程工具，却不想反复处理安装路径、密钥和终端配置的用户，可以从同一个界面认识和管理多个 Agent。已有项目的开发者可以按工作目录创建任务，选择合适的 Agent 与模型，查看执行状态，并在修改文件前确认计划。

当前已用真实调用验证 Kimi Code、Codex、Claude Code 和 Pi。其他工具的安装入口与能力说明已提供，具体可用性取决于本机安装、授权和后续验证。

## 使用

打开 `src-tauri/target/release/bundle/macos/AgentHub.app`。先添加实际项目目录，再新建任务选择 Agent。默认项目 `~` 是用户主目录，不是本项目目录。

- **Kimi**：主窗口直接显示官方 Web 页面。思考、计划审批、文件、工具、会话与设置使用原生功能。模型由上方下拉框选择，密钥在设置中保存。
- **Codex / Claude / Pi**：选择“模型服务 → Kimi Code API”和 `kimi-for-coding`，即可使用已实测的接入。原有登录可独立选择；检测到登录配置不代表登录仍有效。
- **计划模式**：先调研并提交计划；点击“确认计划并执行”才切换到可修改阶段。Kimi 使用原生审批；Claude/Codex 支持窗口工具授权；Pi 用只读工具列表限制计划。
- **切换 Agent**：新建独立会话，保留旧任务，避免把不同 Agent 的内部会话混用。
- **停止**：中断当前模型轮次，不删除对话。程序重启后点击原任务可恢复原生会话。
- **历史记录**：v0.4 及更早的 Kimi 简易对话保存在“迁移前记录”，不会自动成为新原生会话的上下文。需要延续旧需求时，请明确复制所需内容。

## 能力边界

已用真实 Kimi API 验证 Kimi、Codex、Claude、Pi。其余六个 Agent 提供官方文档对应的入口和明确限制，尚未安装/授权，不能视为已通过端到端测试。AgentHub 不是各厂商桌面 App 的完整复制品：未公开接口、付费特性和自定义扩展不能保证等价。原生网页主题在各自设置中切换；外框明暗按钮只调整外框。

Kimi 原生页面可自行创建其他会话。外框状态与模型控制绑定启动时对应的 AgentHub 任务；在原生页面切到其他会话后，请使用原生状态和停止按钮，或从 AgentHub 新建任务保持一一对应。

窗口不会加载 Claude 项目钩子及 Pi 扩展，以维持计划约束；这些功能可从“官方终端”使用。终端执行遵循官方 Agent 自身配置，不受窗口计划模式控制。自动化仍采用独立的非交互执行路径，不等同于交互式任务。系统桌面通知暂未接入，界面已明确标注。

## 开发与测试

需要 Node.js 22+、npm、Rust 和 macOS 构建工具。首次运行请安装依赖：`npm ci`。

```sh
npm run dev                 # 浏览器界面预览，不执行真实任务
npm run tauri dev           # 桌面开发
npm test                   # 会话边界与权限自动检查，无 API 消耗
npm run build
cd src-tauri && cargo test
```

正式应用：`npm run tauri build -- --bundles app`。

真实测试会消耗 API 额度，只有明确需要时运行；脚本仅从钥匙串读密钥，在系统临时目录创建隔离样例，不触碰项目源码：

```sh
node runtime/live-check.cjs kimi-code      # 计划 → 确认 → 写入样例
node runtime/recovery-check.cjs codex      # 重启并验证上下文
node runtime/cancel-check.cjs claude-code  # 运行中停止
```

以上脚本可用 `kimi-code`、`codex`、`claude-code`、`pi-coding`。

当前支持范围与遗留事项见 [docs/STATUS.md](docs/STATUS.md)。图标来源见 [public/brands/SOURCES.md](public/brands/SOURCES.md)。密钥不应写入代码或命令行参数。应用目前仅做本机临时签名，尚未完成对外分发公证。

## 许可

本仓库公开源码，原创代码和文档采用 [PolyForm Noncommercial 1.0.0](LICENSE)：允许非商业用途的使用、修改和再分发，商业用途需要另行取得授权。这是**非商业源码许可**，不属于 OSI 定义的开源许可证。第三方名称、商标及 `public/brands/` 中的标识仍归各权利人所有，不在上述许可范围内。
