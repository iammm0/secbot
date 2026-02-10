# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.3] - 2025-02-10

### Fixed

- Windows 构建：Install dependencies / Build executable 步骤指定 `shell: bash`，避免 PowerShell 解析 Bash 条件语句报错。

---

## [1.2.2] - 2025-02-10

### Added

- Release 增加 **macOS Intel (darwin-amd64)** 构建产物，Intel 处理器的 Mac 可下载 `hackbot-darwin-amd64.zip`。

### Fixed

- Windows 构建中「Package artifact」步骤改用 Python `shutil.make_archive` 打包，解决 `zip: command not found`。

---

## [1.2.0] - 2025-02-10

### Added

- TUI 公共工具模块 `tui/utils.py`，抽取 `adaptive_padding()` 等复用逻辑
- 推理流式渲染：流式阶段使用轻量 `Text` 渲染，末尾闪烁打字光标 `▌`，刷新率 12 FPS，最大行数 50
- 报告组件流式渲染：`REPORT_CHUNK` 期间 Live 实时展示报告内容并带光标动画
- 任务状态与规划展示的语义化 emoji：📋 规划、💭 推理、⚡ 执行、📊 报告、✅ 完成；Todo 列表使用 ⬜/🔄/✅/⛔

### Changed

- **Reasoning**：流式到静态过渡修复，`transient=True` 清除 Live 帧后统一 `display()` 输出 Markdown 最终版，避免重复渲染
- **Report**：最终报告面板使用 `box.DOUBLE` 边框；支持流式 Live 展示
- **Execution**：参数区使用 `box.SIMPLE_HEAD` 与 `Rule` 分隔；脚本代码区用 dim Panel 突出；成功/失败标题增加 ✅/❌
- **Planning**：简单目标（仅 1 步）改为单行展示，不再展开完整规划面板
- **Todo 列表**：当前执行项高亮，emoji 图标替代方括号
- **Release 工作流**：补全 PyInstaller 构建步骤，推送 tag 时正确生成并打包可执行文件

### Fixed

- 推理流式阶段反复解析 Markdown 导致的卡顿与闪烁
- 规划仅单步时仍展示完整面板的“过度规划”表现

---

## [1.0.0] - 此前版本

- 初始功能：ReAct 安全测试智能体、规划/推理/执行/报告 TUI、多工具与编排流程等。

[1.2.3]: https://github.com/iammm0/hackbot/releases/tag/v1.2.3
[1.2.2]: https://github.com/iammm0/hackbot/releases/tag/v1.2.2
[1.2.0]: https://github.com/iammm0/hackbot/releases/tag/v1.2.0
[1.0.0]: https://github.com/iammm0/hackbot/releases/tag/v1.0.0
