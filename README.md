# hackbot: Automated Penetration Testing Robot

<div align="center">

**An intelligent automated penetration testing robot with AI-powered security testing capabilities**

[English](#hackbot-automated-penetration-testing-robot) | [中文](README_CN.md)

</div>

---

## ⚠️ Security Warning

**This tool is intended for authorized security testing only. Unauthorized use of this tool for network attacks is illegal.**

- ✅ Only use on systems you own or have explicit written authorization to test
- ✅ Ensure you comply with all applicable laws and regulations
- ✅ Use responsibly and ethically

## 🚀 Features

### Core Capabilities

- 🤖 **Multiple Agent Patterns**: ReAct, Plan-Execute, Multi-Agent, Tool-Using, Memory-Augmented
- 🌐 **AI Web Research Agent**: Independent sub-agent with ReAct loop for internet research—smart search, page extraction, multi-page crawling, and API interaction
- 💻 **CLI Interface**: Built with Typer for intuitive command-line interaction
- 🎤 **Voice Interaction**: Complete speech-to-text and text-to-speech functionality
- 🕷️ **AI Web Crawler**: Real-time web information capture and monitoring
- 💻 **OS Control**: File operations, process management, system information

### Penetration Testing

- 🔍 **Reconnaissance**: Automated information gathering (hostname, IP, ports, services)
- 🔍 **Vulnerability Scanning**: Port scanning, service detection, vulnerability identification
- ⚔️ **Exploit Engine**: Automated exploitation of SQL injection, XSS, command injection, file upload, path traversal, SSRF
- 🔗 **Automated Attack Chain**: Complete penetration testing workflow automation
  - Information Gathering → Vulnerability Scanning → Exploitation → Post-Exploitation
- 📦 **Payload Generator**: Automatic generation of attack payloads
- 🎯 **Post-Exploitation**: Privilege escalation, persistence, lateral movement, data exfiltration
- ⚔️ **Network Attacks**: Brute force, DoS testing, buffer overflow (authorized testing only)

### Security & Defense

- 🛡️ **Active Defense**: Information collection, vulnerability scanning, network analysis, intrusion detection
- 📊 **Security Reports**: Automated detailed security analysis reports
- 🔍 **Network Discovery**: Automatic discovery of all hosts in the network
- 🎯 **Authorization Management**: Manage legal authorization for target hosts
- 🖥️ **Remote Control**: Remote command execution and file transfer on authorized hosts

### Web Research (Internet Capabilities)

- 🔎 **Smart Search**: DuckDuckGo search → fetch result pages → AI summarization and synthesis
- 📄 **Page Extract**: Extract page content by mode—plain text, structured (tables/lists), or custom AI schema
- 🕸️ **Deep Crawl**: BFS multi-page crawling from a start URL with depth/URL filter and optional AI extraction
- 🔌 **API Client**: Generic REST client with presets (weather, IP info, GitHub, exchange rates, DNS, etc.)
- 🤖 **Web Research Tool**: Delegate to the Web Research sub-agent for autonomous research or call tools directly

### Additional Features

- 📝 **Prompt Chain Management**: Flexible agent prompt configuration
- 💾 **SQLite Database**: Persistent storage for conversation history, prompt chains, configurations
- ⏰ **Task Scheduling**: Support for scheduled penetration testing tasks
- 🎨 **Beautiful Terminal Output**: Rich formatting with Rich library

## 📋 Requirements

- Python 3.10+
- [uv](https://github.com/astral-sh/uv) - Fast Python package manager
- Ollama (for LLM inference)
- Dependencies are managed in `pyproject.toml`

## 🛠️ Installation

### 1. Clone the Repository

```bash
git clone https://github.com/iammm0/hackbot.git
cd hackbot
```

### 2. Install Dependencies

[uv](https://github.com/astral-sh/uv) is a fast Python package installer and resolver.

```bash
# Install uv if not already installed
curl -LsSf https://astral.sh/uv/install.sh | sh

# Install dependencies using uv
uv sync
```

### 3. Install and Start Ollama

```bash
# Install Ollama from https://ollama.ai

# Pull required models
ollama pull gemma3:1b
ollama pull nomic-embed-text

# Ollama service runs on http://localhost:11434 by default
```

Edit `.env` file:
- `OLLAMA_MODEL`: Inference model (default: `gemma3:1b`). If not present locally, the app will pull it when you open the model list.
- `OLLAMA_EMBEDDING_MODEL`: Embedding model (default: `nomic-embed-text`)

### 5. Build and Install (Optional)

```bash
# Build package using uv
uv run python -m build

# Install package（包名为 secbot，版本见 pyproject.toml）
uv pip install dist/secbot-*.whl

# 安装后可使用以下命令（无参数均为交互模式）
hackbot
# 或
secbot
```

## 🎯 Quick Start

### 推荐：一条命令启动（后端 + 终端 TUI）

```bash
# 无参数运行：先启动 Python 后端（若未运行），再启动 TypeScript 终端 TUI（全屏）
python main.py
# 或安装后
hackbot
# 或
secbot
```

会接管当前终端；输入 `exit` 或 `quit` 退出。所有交互（对话、切换 agent、工具、斜杠命令）均在 TUI 内完成，输入 `/` 后回车可查看命令列表。

### 仅启动后端（供 TUI 或 API 调用）

```bash
python main.py --backend
# 或
uv run secbot-server
# 或
uv run hackbot-server
# 或
python -m router.main
```

默认监听 `http://localhost:8000`。

### 仅 Python 交互 CLI（无需 Node）

若不想使用 TypeScript TUI，可直接用 Python 自带的交互模式（无需先起后端）：

```bash
uv run secbot
# 或
uv run hackbot
```

### 在交互模式中的示例

启动后（无论 TUI 还是 `uv run secbot`），你可以：

- **Web research**: e.g. "Research the latest CVE-2024 vulnerabilities and summarize", or "Use smart_search to find Python asyncio best practices", or "Use api_client with preset weather and query Beijing"
- **Recon / scanning**: e.g. "Scan ports on 192.168.1.1" or use slash commands like `/list-targets`, `/list-authorizations`, `/defense-scan`, `/defense-blocked`
- **Remote control / defense**: use slash commands such as `/list-targets`, `/list-authorizations`; other operations are available via natural language or `/` commands (type `/` then Enter to list all).

System info, database stats/history, voice, and prompt management are available inside the interactive session via slash commands (e.g. `/system-info`, `/db-stats`, `/db-history`, `/prompt-list`) or natural language. See in-app help (type `/` then Enter) for the full list.

### Terminal UI（TypeScript 生态，推荐）

终端界面采用 **TypeScript 生态**（[Ink](https://github.com/vadimdemedes/ink) + React），通过 HTTP/SSE 连接 Python 后端。

- **一条命令进入 TUI**：在项目根目录执行 `python main.py`（会自动启动后端并打开 TUI）。
- **分步启动**：先启动后端（`uv run secbot-server` 或 `python -m router.main`），再在另一终端进入 `terminal-ui` 运行 `npm install && npm run tui`。

后端地址：环境变量 `SECBOT_API_URL` 或 `BASE_URL`（默认 `http://localhost:8000`）。一键脚本：Windows 运行 `.\scripts\start-ts-tui.ps1` 或 `.\scripts\start-cli.ps1`，Linux/macOS 运行 `./scripts/start-ts-tui.sh`。详见 [terminal-ui/README.md](terminal-ui/README.md)。

无需 Node 时可使用 Python 交互 CLI：`uv run secbot` 或 `uv run hackbot`。

## 🔧 Development

### Running Tests

```bash
pytest tests/
```

### Building Package

```bash
# Using uv (recommended)
uv run python -m build

# Or using the build script
./build.sh
```

## 📚 Documentation

- [Quick Start Guide](docs/QUICKSTART.md)
- [UI Design & Interaction](docs/UI-DESIGN-AND-INTERACTION.md) — terminal UI (TypeScript/Ink) 架构说明
- [API Documentation](docs/API.md)
- [Mobile App Guide](docs/APP.md)
- [Skills & Memory System](docs/SKILLS_AND_MEMORY.md)
- [Database Guide](docs/DATABASE_GUIDE.md)
- [Docker Setup](docs/DOCKER_SETUP.md)
- [Ollama Setup](docs/OLLAMA_SETUP.md)
- [Security Warning](docs/SECURITY_WARNING.md)
- [Virtual Test Environment (VMware + Ubuntu)](docs/VIRTUAL_TEST_ENVIRONMENT.md) — 在虚拟机中测试 secbot 的说明
- [Prompt Guide](docs/PROMPT_GUIDE.md)
- [Speech Guide](docs/SPEECH_GUIDE.md)
- [SQLite Setup](docs/SQLITE_SETUP.md)
- [Deployment Guide](docs/DEPLOYMENT.md)
- [Changelog](docs/CHANGELOG.md) · [Release](docs/RELEASE.md)

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 👤 Author

**赵明俊 (Zhao Mingjun)**

- GitHub: [@iammm0](https://github.com/iammm0)
- Email: wisewater5419@gmail.com

## 🙏 Acknowledgments

- Built with [LangChain](https://github.com/langchain-ai/langchain)
- Powered by [Ollama](https://ollama.ai)

## ⚠️ Disclaimer

This tool is provided for educational and authorized security testing purposes only. The authors and contributors are not responsible for any misuse or damage caused by this tool. Users must ensure they have proper authorization before using this tool on any system.

---

<div align="center">

**⭐ If you find this project useful, please consider giving it a star! ⭐**

</div>



