# CHANGELOG

<!-- version list -->

## v2.0.3 (2026-04-06)

### Fixes

- **api**：实现 `POST/GET /api/system/config/provider*` 与 `provider-settings`，修复 TUI 切换 DeepSeek 等厂商时的 404。
- **providers**：DeepSeek / 通义千问等使用注册表内公开默认网关时不再强制填写 Base URL（中转仍可单独配置）。

### Chores

- **ci**：`llm-provider-registry` / `system.service` 经 Prettier 格式化以通过 `format:check`。

## v2.0.2 (2026-04-06)

### Features

- **cli**：`secbot` 一单命令同时启动 Nest 后端与 Ink TUI（全局安装与 `npm pack` 均包含 `terminal-ui/dist`）；`secbot-server` 仍仅启动后端 API。

## v2.0.1 (2026-04-06)

### Chores

- **release**：版本号递增至 `2.0.1`，因 `2.0.0` 已在 npm / GitHub Packages 存在，无法重复发布同版本。

## v1.10.0 (2026-04-03)

### Features

- **app**: 优化移动端会话界面与桌面端样式
  ([`f8ae9a3`](https://github.com/iammm0/secbot/commit/f8ae9a36e53cbbf6c3c915e428c8f885cf6704eb))


## v1.9.0 (2026-04-03)

### Chores

- **release**: 完善发布文档与发布流程测试
  ([`c952102`](https://github.com/iammm0/secbot/commit/c952102aaf14b9ce332b9df596dde34a4e5eb713))

### Features

- **desktop**: 支持将剪切板内容附加为文本/代码块
  ([`c4fc478`](https://github.com/iammm0/secbot/commit/c4fc47864c0df4f62e78432f17aa780d35749db4))


## v1.8.0 (2026-04-01)

_No curated release notes were recorded for this version. Check the commit history for details._

## v1.7.0 (2026-04-01)

### Features

- Updated the multi-client experience and published the `v1.6.1` release line.

## v1.6.1 (2026-04-01)

### Changed

- Refined mobile and desktop UI interactions, including endpoint and type alignment.
- Improved terminal TUI startup and rendering compatibility.
- Updated API, deployment, quickstart, and release documentation along with dependency locks.

## v1.6.0 (2026-03-23)

### Chores

- Updated dependencies and cleaned repository files such as `uv.lock` and container-related ignores.

### Documentation

- Refreshed the main README.

### Features

- Improved the session startup flow in `secbot_cli/launch_tui`.
- Updated terminal UI interactions and content rendering.

## v1.5.0 (2026-03-23)

### Chores

- Added log context and a log viewer tool.

### Documentation

- Updated the README and repository wiki content.

### Features

- Strengthened core routing, attack-chain handling, and session behavior.
- Refined terminal UI components and session presentation.

## v1.4.0 (2026-03-22)

### Features

- Renamed the CLI package to `secbot_cli` and improved database persistence flows.

## v1.3.0 (2026-03-22)

### Chores

- Removed the old release doc and updated desktop Cargo and `uv.lock` files.

### Documentation

- Updated the license and README.
- Refreshed repository wiki documentation.

### Features

- Added the Tauri 2 desktop app with core SSE chat support and updated the README.
- Added `SECBOT_DESKTOP`-style environment toggles for listener behavior and hot reload control.

## v1.2.10 (2026-02-17)

### Fixed

- Switched release builds to `python -m PyInstaller` to avoid the `darwin-amd64` executable invocation failure.

## v1.2.9 (2026-02-17)

### Fixed

- Fixed the Apple Silicon `darwin-amd64` workflow by avoiding the `arch -x86_64 uv` `Bad CPU type` failure.

## v1.2.8 (2026-02-17)

### Changed

- Moved the release workflow to a multi-platform executable build process based on `uv`.

## v1.2.7 (2026-02-17)

### Changed

- Removed the `requirements.txt` dependency from the release workflow and switched to `pyproject.toml` plus `uv sync`.

## v1.2.6 (2026-02-17)

### Added

- Added the virtual test environment guide in [docs/VIRTUAL_TEST_ENVIRONMENT.md](docs/VIRTUAL_TEST_ENVIRONMENT.md).
- Added initial product screenshots to README and QUICKSTART.

### Changed

- Simplified documentation to describe SQLite-only persistence and removed references to extra database services.
- Rewrote the Docker setup guide to match the current deployment strategy.

## v1.2.0 (2026-03-22)

### Features

- Updated the TUI footer branding to a fixed green Secbot treatment and removed the rainbow animation.

## v1.1.1 (2026-03-20)

### Bug Fixes

- Restored reasoning event emission in `execute_todo`, including `thought_start`, `chunk`, and `end`.

### Code Style

- Reformatted core code and cleaned up reasoning event emission.

### Documentation

- Updated README installation guidance and main screen presentation.
- Updated project knowledge-base and release-related docs.

## v1.1.0 (2026-03-15)

### Documentation

- Added the repository wiki knowledge base to version control.
- Rewrote the README with a clearer open-source structure and docs layout.

### Features

- Expanded agents and terminal UI behavior, and improved LLM fallback-related docs and tooling.

## v1.0.0 (2026-03-11)

- Initial release.
