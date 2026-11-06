# AgentHub

<p align="center">
  <img src="src-tauri/icons/icon.png" width="96" alt="AgentHub app icon">
</p>

<p align="center">
  <strong>Manage multiple AI coding assistants in one macOS workspace.</strong><br>
  Organize tasks by project, review plans before running them, and pick up where you left off.
</p>

<p align="center">
  <a href="README.md">简体中文</a> · English
</p>

<p align="center">
  v0.5.0 · macOS · <a href="LICENSE">Noncommercial license</a><br>
  Developed by <a href="https://github.com/Jessica-yaoyao">Jessica-yaoyao</a> and
  <a href="https://github.com/IronMan-libingxue">IronMan-libingxue</a>
</p>

## Get AgentHub

| Option | Details |
| --- | --- |
| [Download the source ZIP](https://github.com/Jessica-yaoyao/AgentHub/archive/refs/heads/main.zip) | A snapshot of the main branch for browsing the code or building locally |
| [Build on macOS](#build-and-test-locally) | v0.5.0 has been built on an Apple silicon Mac. A public installer is pending |

## Interface preview

These screenshots show the v0.5.0 browser preview with demonstration tasks, installation statuses, and diagnostics.

![AgentHub task view with projects in the sidebar and a sample Claude Code plan, model selector, and composer](docs/images/task-planning.png)

*Choose a project and assistant, review the task plan, or open an earlier task from the sidebar.*

| Agent catalog | Settings and connection status |
| --- | --- |
| [![The agent catalog with installation and setup statuses](docs/images/agent-market.png)](docs/images/agent-market.png) | [![Settings for API keys and agent status, with all example keys unconfigured](docs/images/settings.png)](docs/images/settings.png) |
| Find assistants and see which ones need setup or repair. | Configure services and review connection status. Select an image to see it at full size. |

## Main features

- **Organize work by project.** Add a local folder as a project and keep multiple tasks alongside it. Each assistant keeps its own sessions.
- **Manage assistants in one place.** Browse the catalog, check setup status, and use the install, repair, or removal options available for each assistant.
- **Choose an assistant and model.** Use an assistant's existing sign-in where supported, or choose the Kimi Code API for compatible assistants.
- **Review the plan before running it.** With a supported integration, plan mode lets the assistant read and analyze first. Approve the plan to allow changes to files.
- **Stop and resume tasks.** Stop an active run and keep its task history. Supported assistants can resume from an existing task after the app restarts.

## Quick start

1. Build and open AgentHub. Select the plus button next to Projects and choose the folder you want to work in.
2. Check that your assistant is ready in the agent catalog. If it needs an API key, configure your service in Settings.
3. Create a task and choose the project, assistant, and an available model. To try plan mode, ask it to read the project overview and suggest three improvements, starting with a plan.
4. Review and approve the plan or revise your request. Select Stop to interrupt an active run, and return to the task from the sidebar.

## Tested integrations

| Assistant | What the project has tested |
| --- | --- |
| Kimi Code | The official interface opens within AgentHub. Recorded live checks cover sessions, plan approval, stopping, and resuming. |
| Codex, Claude Code, Pi | Task runs, plan approval, stopping, and resuming were tested with the Kimi Code API. Existing sign-ins are available according to each assistant's capabilities. |
| Gemini CLI, Qwen Code, Cursor Agent, OpenCode, Aider, OpenClaw | Listed in the catalog. End-to-end task runs remain to be verified for each one. |

See the [project status](docs/STATUS.md) for integration details and limitations. Terminal sessions and scheduled automation each follow their own execution rules.

## Data and privacy

AgentHub stores API keys entered in its settings in the macOS Keychain and keeps task history and preferences on the device. When you run a task, the selected assistant or model service processes the task content according to its integration. Use your own account, authorization, and service quota.

## Build and test locally

Use Node.js 22 or later, npm, Rust, and the macOS command-line developer tools. From the project folder, run these commands.

```sh
npm ci
npm run tauri build -- --bundles app
```

Find `AgentHub.app` in `src-tauri/target/release/bundle/macos/`. Run `npm run dev` for a browser preview. For local checks, run `npm test`, `npm run build`, and `cargo test --manifest-path src-tauri/Cargo.toml`.

## Authors and license

AgentHub is developed by [Jessica-yaoyao](https://github.com/Jessica-yaoyao) and [IronMan-libingxue](https://github.com/IronMan-libingxue). See the full [author credits](AUTHORS.md).

The original code and documentation are available under [PolyForm Noncommercial 1.0.0](LICENSE). Third-party names and logos belong to their respective owners. See the [brand sources](public/brands/SOURCES.md).
