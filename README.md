# AgentHub

<p align="center">
  <img src="src-tauri/icons/icon.png" width="96" alt="AgentHub 应用图标">
</p>

<p align="center">
  <strong>在同一个 macOS 工作台里管理多个 AI 编程助手。</strong><br>
  按项目组织任务，先看计划再执行，随时回来继续。
</p>

<p align="center">
  简体中文 · <a href="README.en.md">English</a>
</p>

<p align="center">
  v0.5.0 · macOS · <a href="LICENSE">非商业许可</a><br>
  <a href="https://github.com/Jessica-yaoyao">Jessica-yaoyao</a> 与
  <a href="https://github.com/IronMan-libingxue">IronMan-libingxue</a> 共同开发
</p>

## 获取 AgentHub

| 获取方式 | 说明 |
| --- | --- |
| [下载源码 ZIP](https://github.com/Jessica-yaoyao/AgentHub/archive/refs/heads/main.zip) | 下载当前主分支，适合查看代码或自行构建 |
| [在 macOS 本地构建](#本地构建与测试) | v0.5.0 已在 Apple 芯片 Mac 上构建。公开安装包尚未发布 |

## 界面预览

截图来自 v0.5.0 的浏览器预览，画面中的任务、安装状态和诊断信息均为演示数据。

![AgentHub 任务界面。左侧按项目列出任务，右侧展示 Claude Code 的示例计划、模型选项和输入框](docs/images/task-planning.png)

*在任务界面切换项目和助手，阅读计划，或从侧栏打开历史任务。*

| 插件市场 | 设置与连接状态 |
| --- | --- |
| [![在插件市场浏览助手及其安装状态](docs/images/agent-market.png)](docs/images/agent-market.png) | [![在设置中管理 API 密钥和查看助手状态。示例中的密钥均未配置](docs/images/settings.png)](docs/images/settings.png) |
| 查找助手，查看哪些已安装、需要配置或需要修复。 | 集中配置服务并检查连接状态。点击图片可查看原图。 |

## 主要功能

- **按项目组织工作。** 添加本机目录作为项目，在同一个项目里分别保留多个任务。不同助手的会话各自保存。
- **集中管理助手。** 在插件市场查找助手并查看安装和登录配置状态，根据助手提供的选项安装、修复或移除。
- **选择助手和模型。** 新建任务时选择合适的助手，按接入方式使用它原有的登录，或在支持的助手里选择 Kimi Code API。
- **先看计划，再决定是否执行。** 在支持的接入中，计划阶段先读取和分析。确认计划后，助手才进入可修改文件的阶段。
- **随时停止和继续。** 可以停止当前运行并保留任务记录。重新打开应用后，支持恢复的助手可以从原任务继续。

## 快速开始

1. 构建并打开 AgentHub。在侧栏「项目」旁点击「+」，选择要工作的目录。
2. 在「插件市场」检查要用的助手是否就绪。需要 API 密钥时，在「设置」里配置自己的服务。
3. 点击「新建任务」，选定项目、助手和可用模型。第一次可以用计划模式试试「请阅读项目说明和目录，列出三项整理建议，先给计划。」
4. 阅读计划后，在界面确认执行或调整要求。要中断时点击停止，之后可从侧栏回到原任务。

## 已验证的接入

| 助手 | 项目记录中的验证范围 |
| --- | --- |
| Kimi Code | 在工作台内使用官方界面。会话、计划确认、停止和恢复有真实调用记录。 |
| Codex、Claude Code、Pi | 使用 Kimi Code API 验证过任务运行、计划确认、停止和恢复。可按各助手的支持情况选择原有登录。 |
| Gemini CLI、Qwen Code、Cursor Agent、OpenCode、Aider、OpenClaw | 插件市场提供对应入口。完整任务流程仍需逐一验证。 |

具体支持范围和限制见 [项目状态](docs/STATUS.md)。终端入口和自动化任务分别遵循各自的执行规则。

## 数据与隐私

在 AgentHub 设置中保存的 API 密钥进入 macOS 钥匙串，任务记录和设置保存在本机。运行任务时，所选助手或模型服务会按其接入方式处理任务内容，使用者需自备所需账号、授权和额度。

## 本地构建与测试

需要 Node.js 22 或更新版本、npm、Rust 和 macOS 命令行开发工具。在项目目录执行下面两条命令。

```sh
npm ci
npm run tauri build -- --bundles app
```

构建后可在 `src-tauri/target/release/bundle/macos/` 找到 `AgentHub.app`。如只想预览界面，运行 `npm run dev`。本地检查可运行 `npm test`、`npm run build` 和 `cargo test --manifest-path src-tauri/Cargo.toml`。

## 作者与许可

项目由 [Jessica-yaoyao](https://github.com/Jessica-yaoyao) 和 [IronMan-libingxue](https://github.com/IronMan-libingxue) 共同开发。完整署名见 [AUTHORS.md](AUTHORS.md)。

原创代码与文档按 [PolyForm Noncommercial 1.0.0](LICENSE) 提供，允许符合条款的非商业使用、修改和分享。第三方名称与标识归各自权利人所有，见 [品牌素材来源](public/brands/SOURCES.md)。
