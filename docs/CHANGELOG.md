# Changelog

All notable changes to this project are documented in this file.

## [1.6.1] - 2026-04-01

### Changed

- 移动端与桌面端 UI 交互细节优化，类型与端点适配同步更新
- 终端 TUI 启动与展示体验优化（含日志与终端显示兼容性改进）
- 文档（API/部署/快速开始/发布）与依赖锁文件同步更新

## [1.6.0] - 2026-03-23

### Changed

- `terminal-ui`：更新前端交互与内容渲染
- `secbot_cli/launch_tui`：优化源码模式下的启动流程与运行体验
- 文档与依赖：同步更新 README，并清理部分仓库文件

## [1.5.0] - 2026-03-23

### Added

- 日志上下文与日志查看工具

### Changed

- `terminal-ui`：更新交互组件与会话展示
- `core`：增强智能体路由、攻击链与会话能力
- 文档：同步更新 README 与相关说明

## [1.4.0] - 2026-03-22

### Changed

- CLI 包更名为 `secbot_cli`
- 完善数据库持久化链路

## [1.3.0] - 2026-03-22

### Added

- 新增 `desktop/` Tauri 2 桌面端（核心 SSE 聊天能力）
- `router.main` 新增 `SECBOT_DESKTOP` 等环境变量控制监听地址与热重载

### Changed

- 更新 LICENSE 与 README

## [1.2.10] - 2026-02-17

### Fixed

- Release 工作流：使用 `python -m PyInstaller` 替代直接调用 `pyinstaller` 脚本，避免 `darwin-amd64` 下 “isn't executable” 错误

## [1.2.9] - 2026-02-17

### Fixed

- Release 工作流 `darwin-amd64`：修复在 Apple Silicon 上 `arch -x86_64 uv` 报 `Bad CPU type` 的问题

## [1.2.8] - 2026-02-17

### Changed

- 发布流程改为基于 `uv` 的多平台可执行程序构建

## [1.2.7] - 2026-02-17

### Changed

- Release 工作流不再使用 `requirements.txt`，改为基于 `pyproject.toml` + `uv sync` 安装依赖并构建可执行程序

## [1.2.6] - 2026-02-17

### Added

- 文档：[虚拟测试环境使用指南](VIRTUAL_TEST_ENVIRONMENT.md)
- README / QUICKSTART 中补充初始化界面展示图

### Changed

- 文档统一改为仅描述 SQLite 持久化，不再提及 ChromaDB、Redis 等额外服务
- `DOCKER_SETUP` 重写为当前 Docker 策略说明

## [1.2.4] - 2025-02-10

### Fixed

- 依赖构建：约束 `setuptools<70`，解决 `llvmlite` 构建时报 `spawn() got an unexpected keyword argument 'dry_run'`

## [1.2.3] - 2025-02-10

### Fixed

- Windows 构建步骤指定 `shell: bash`，避免 PowerShell 解析 Bash 条件语句时报错

## [1.2.2] - 2025-02-10

### Added

- 发布流程增加 macOS Intel (`darwin-amd64`) 构建产物

### Fixed

- Windows 构建中改用 Python `shutil.make_archive` 打包，避免缺少 `zip` 命令

## [1.2.0] - 2025-02-10

### Added

- TUI 公共工具模块 `tui/utils.py`
- 推理与报告的流式渲染增强
- 任务状态与规划展示的语义化图标

### Changed

- 优化 Reasoning / Report / Execution / Planning 面板展示
- 完善 Release 工作流的 PyInstaller 构建步骤

### Fixed

- 修复推理阶段重复渲染导致的卡顿与闪烁
- 修复单步规划仍过度展示完整面板的问题

## [1.0.0] - 此前版本

- 初始功能：ReAct 安全测试智能体、规划/推理/执行/报告 TUI、多工具与编排流程
