# 发布版使用说明

本文档分两部分：

- **普通使用者**：如何使用 GitHub Release 下载的打包产物
- **维护者**：如何基于当前仓库结构生成发布包

## 一、普通使用者

### 1. 从哪里下载

请前往：

[https://github.com/iammm0/secbot/releases](https://github.com/iammm0/secbot/releases)

下载与你平台匹配的 zip 包。

说明：

- 当前 GitHub Actions / PyInstaller 产物仍沿用历史命名，压缩包和可执行文件可能仍以 `hackbot` 命名
- 这不影响运行，但文档中会统一说明这一点，避免解压后找不到可执行文件

### 2. 解压后会看到什么

解压后通常会得到一个目录，当前可执行文件一般为：

- Windows：`hackbot.exe`
- Linux / macOS：`hackbot`

### 3. 运行前配置 `.env`

在可执行文件同目录创建 `.env` 文件。最常见的最小配置如下：

使用 DeepSeek：

```env
LLM_PROVIDER=deepseek
DEEPSEEK_API_KEY=sk-your-api-key
DEEPSEEK_MODEL=deepseek-reasoner
```

使用 Ollama：

```env
LLM_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=gemma3:1b
OLLAMA_EMBEDDING_MODEL=nomic-embed-text
```

### 4. 运行方式

- Windows：双击 `hackbot.exe`，或在终端中执行
- Linux / macOS：先 `chmod +x hackbot`，再执行 `./hackbot`

说明：

- 打包产物默认进入交互式终端界面
- 如果未满足完整 TUI 条件，程序会尽量给出明确提示

## 二、维护者：如何生成发布包

### 1. 版本与变更记录

当前版本号来源于 `pyproject.toml` 中的 `project.version`。发布前请确认：

- `pyproject.toml` 版本号正确
- `docs/CHANGELOG.md` 已同步主要变更

仓库当前使用 `python-semantic-release` 维护版本与 release 流程，配置位于 `pyproject.toml`。

### 2. GitHub Actions 发布

工作流文件：

`/.github/workflows/release.yml`

当前流程会：

- 在 `main` / `beta` 分支 push 时尝试发布
- 使用 PyInstaller 基于 `hackbot.spec` 生成多平台 onedir 产物
- 上传 zip 到 GitHub Release

### 3. 本地手动打包

先安装依赖：

```bash
uv sync
uv pip install pyinstaller
```

再执行：

```bash
uv run python -m PyInstaller hackbot.spec
```

当前打包产物目录为：

```text
dist/hackbot/
```

其中包含：

- `hackbot` 或 `hackbot.exe`
- 依赖库
- 发布说明文件（若由 CI 注入）

### 4. 当前命名约定

虽然仓库与包名已经是 `secbot` / `secbot_cli`，但 PyInstaller 相关构建链路仍保留历史命名：

- spec：`hackbot.spec`
- 产物目录：`dist/hackbot/`
- 可执行文件名：`hackbot`

因此在发布说明、下载页面与使用文档中，应优先以**实际可执行文件名**为准。

## 三、已知注意事项

- 仓库当前没有根目录 `.env.example`，发布说明应直接给出可复制的 `.env` 示例
- wheel / pip 安装与 GitHub Release 打包产物并不完全等价，完整 TUI 体验以源码运行或 Release 包为准
- 如果你在 macOS / Linux 上下载的是裸可执行文件，首次运行前通常需要 `chmod +x`
