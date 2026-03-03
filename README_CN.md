# hackbot: 自动化渗透测试机器人

<div align="center">

**一个智能化的自动化渗透测试机器人，具备AI驱动的安全测试能力**

[English](README_EN.md) | [中文](#hackbot-自动化渗透测试机器人)

</div>

---

## ⚠️ 安全警告

**本工具仅用于授权的安全测试。未经授权使用本工具进行网络攻击是违法的。**

- ✅ 仅对您拥有或已获得明确书面授权的系统使用
- ✅ 确保遵守所有适用的法律法规
- ✅ 负责任和道德地使用

## 🚀 功能特性

### 核心能力

- 🤖 **多种智能体模式**: ReAct、Plan-Execute、多智能体、工具使用、记忆增强
- 💻 **命令行界面**: 使用Typer构建的直观命令行交互
- 🎤 **语音交互**: 完整的语音转文字和文字转语音功能
- 🕷️ **AI网络爬虫**: 实时网络信息捕获和监控
- 💻 **操作系统控制**: 文件操作、进程管理、系统信息

### 渗透测试

- 🔍 **信息收集**: 自动化信息收集（主机名、IP、端口、服务）
- 🔍 **漏洞扫描**: 端口扫描、服务检测、漏洞识别
- ⚔️ **漏洞利用引擎**: 自动化执行SQL注入、XSS、命令注入、文件上传、路径遍历、SSRF等漏洞利用
- 🔗 **自动化攻击链**: 完整的渗透测试工作流自动化
  - 信息收集 → 漏洞扫描 → 漏洞利用 → 后渗透
- 📦 **Payload生成器**: 自动生成各种攻击payload
- 🎯 **后渗透利用**: 权限提升、持久化、横向移动、数据exfiltration
- ⚔️ **网络攻击**: 暴力破解、DoS测试、缓冲区溢出（仅限授权测试）

### 安全与防御

- 🛡️ **主动防御**: 信息收集、漏洞扫描、网络分析、入侵检测
- 📊 **安全报告**: 自动化详细安全分析报告
- 🔍 **网络发现**: 自动发现网络中的所有主机
- 🎯 **授权管理**: 管理对目标主机的合法授权
- 🖥️ **远程控制**: 在授权主机上执行远程命令和文件传输

### 附加功能

- 📝 **提示词链管理**: 灵活的智能体提示词配置
- 💾 **SQLite数据库**: 持久化存储对话历史、提示词链、配置
- ⏰ **任务调度**: 支持定时执行渗透测试任务
- 🎨 **美观的终端输出**: 使用Rich库的丰富格式化

## 📋 系统要求

- Python 3.10+
- [uv](https://github.com/astral-sh/uv) - 快速 Python 包管理器
- Ollama (用于 LLM 推理)
- 依赖在 `pyproject.toml` 中管理

## 📦 发布版（免 Python 安装）

若不想安装 Python，可直接使用**单文件可执行程序**（Windows / macOS / Linux）：

1. 在 [Releases](https://github.com/iammm0/hackbot/releases) 下载对应平台 zip（如 `hackbot-linux-amd64.zip`），解压得到 `hackbot` 目录。
2. **配置 DeepSeek API Key**（启动前唯一必须条件）：环境变量 `DEEPSEEK_API_KEY=sk-xxx`，或在 `hackbot` 目录内创建 `.env` 写入该变量。
3. 进入 `hackbot` 目录，运行 `./hackbot`（Linux/macOS）或 `hackbot.exe`（Windows）即可进入交互式界面。

详见 [发布版使用说明](docs/RELEASE.md)。

---

## 🛠️ 安装（从源码运行）

### 1. 克隆仓库

```bash
git clone https://github.com/iammm0/hackbot.git
cd hackbot
```

### 2. 安装依赖

[uv](https://github.com/astral-sh/uv) 是一个快速的 Python 包安装器和解析器。

```bash
# 如果尚未安装 uv，请先安装
curl -LsSf https://astral.sh/uv/install.sh | sh

# 使用 uv 安装依赖
uv sync
```

### 3. 安装并启动Ollama

```bash
# 从 https://ollama.ai 安装Ollama

# 下载所需模型
ollama pull gemma3:3b
ollama pull nomic-embed-text

# Ollama服务默认运行在 http://localhost:11434
```

### 4. 配置环境变量

```bash
cp .env.example .env
```

编辑 `.env` 文件：
- `OLLAMA_MODEL`: 推理模型（默认: `gemma3:1b`，本地没有时打开模型列表会自动拉取）
- `OLLAMA_EMBEDDING_MODEL`: 嵌入模型（默认: `nomic-embed-text`）

### 5. 构建并安装（可选）

```bash
# 构建包 (使用 uv)
uv run python -m build

# 安装包
uv pip install dist/hackbot-1.0.0-py3-none-any.whl

# 现在可直接使用 hackbot / secbot（无参数即交互模式）
hackbot
```

## 🎯 快速开始

### 基本使用（无参数即交互模式）

```bash
# 无参数运行即进入交互模式（占据整个终端，退出后恢复）
python main.py
# 或
uv run secbot
# 或（若已安装）hackbot / secbot
```

所有交互（对话、切换智能体、工具、斜杠命令）均在交互会话内完成。输入 `/` 后回车可列出命令；输入 `exit` 或 `quit` 退出。

### 在交互模式内（示例）

启动后可以：

- **渗透/扫描**：例如「扫描 192.168.1.1 的端口」，或使用斜杠命令 `/list-targets`、`/list-authorizations`、`/defense-scan`、`/defense-blocked`
- **系统/数据库/语音/提示词**：使用 `/system-info`、`/db-stats`、`/db-history`、`/prompt-list` 等；输入 `/` 后回车可查看全部命令

远程控制、防御、系统状态、数据库、语音、提示词等均在交互模式内通过斜杠命令或自然语言使用（如 `/list-authorizations`、`/defense-scan`、`/system-info`、`/db-stats`、`/prompt-list` 等），输入 `/` 后回车可查看全部命令。

### 终端 UI（TypeScript 生态，推荐）

终端界面采用 **TypeScript 生态**（[Ink](https://github.com/vadimdemedes/ink) + React），通过 HTTP/SSE 连接 Python 后端：

1. 先启动后端：`python -m router.main` 或 `uv run hackbot-server`
2. 在另一终端进入 `terminal-ui` 并运行：`npm install && npm run tui`

配置后端地址：环境变量 `SECBOT_API_URL` 或 `BASE_URL`（默认 `http://localhost:8000`）。一键启动：Windows 运行 `.\scripts\start-ts-tui.ps1`，Linux/macOS 运行 `./scripts/start-ts-tui.sh`。详见 [terminal-ui/README.md](terminal-ui/README.md)。

也可使用上述 Python 交互模式（无参数运行 `python main.py` 或 `uv run secbot`），作为无需 Node 的备用方式。

## 🔧 开发

### 运行测试

```bash
pytest tests/
```

### 构建包

```bash
# 使用 uv (推荐)
uv run python -m build

# 或使用构建脚本
./build.sh
```

## 📚 文档

- [快速开始指南](docs/QUICKSTART.md)
- [UI 设计与交互](docs/UI-DESIGN-AND-INTERACTION.md) — 终端 UI（TypeScript/Ink）架构说明
- [API 文档](docs/API.md)
- [移动应用指南](docs/APP.md)
- [技能与记忆系统](docs/SKILLS_AND_MEMORY.md)
- [数据库指南](docs/DATABASE_GUIDE.md)
- [Docker 设置](docs/DOCKER_SETUP.md)
- [Ollama 设置](docs/OLLAMA_SETUP.md)
- [安全警告](docs/SECURITY_WARNING.md)
- [提示词指南](docs/PROMPT_GUIDE.md)
- [语音指南](docs/SPEECH_GUIDE.md)
- [SQLite 设置](docs/SQLITE_SETUP.md)
- [部署指南](docs/DEPLOYMENT.md)

## 🤝 贡献

欢迎贡献！请随时提交Pull Request。

1. Fork 本仓库
2. 创建您的特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交您的更改 (`git commit -m '添加一些AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 打开一个Pull Request

## 📝 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情。

## 👤 作者

**赵明俊 (Zhao Mingjun)**

- GitHub: [@iammm0](https://github.com/iammm0)
- Email: wisewater5419@gmail.com

## 🙏 致谢

- 使用 [LangChain](https://github.com/langchain-ai/langchain) 构建
- 由 [Ollama](https://ollama.ai) 提供支持

## ⚠️ 免责声明

本工具仅用于教育和授权的安全测试目的。作者和贡献者不对因使用本工具造成的任何误用或损害负责。用户在使用本工具对任何系统进行测试之前，必须确保已获得适当的授权。

---

<div align="center">

**⭐ 如果您觉得这个项目有用，请考虑给它一个星标！⭐**

</div>