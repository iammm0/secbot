# hackbot: Automated Penetration Testing Robot

<div align="center">

![Python](https://img.shields.io/badge/python-3.10+-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)
![Status](https://img.shields.io/badge/status-beta-orange.svg)

**An intelligent automated penetration testing robot with AI-powered security testing capabilities**

[English](#hackbot-automated-penetration-testing-robot) | [中文](README_CN.md)

</div>

---

## ⚠️ Security Warning

**This tool is intended for authorized security testing only. Unauthorized use of this tool for network attacks is illegal.**

- ✅ Only use on systems you own or have explicit written authorization to test
- ✅ Ensure you comply with all applicable laws and regulations
- ✅ Use responsibly and ethically

## 初始化界面展示

无参数启动即进入交互模式，**占据整个终端**（alternate screen）；退出后恢复原终端内容。界面示意（`uv run secbot` 或 `python main.py`）：

![Secbot 初始化界面](assets/show_picture.png)

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
ollama pull gpt-oss:20b
ollama pull nomic-embed-text

# Ollama service runs on http://localhost:11434 by default
```

Edit `.env` file:
- `OLLAMA_MODEL`: Inference model (default: `gpt-oss:20b`)
- `OLLAMA_EMBEDDING_MODEL`: Embedding model (default: `nomic-embed-text`)

### 5. Build and Install (Optional)

```bash
# Build package using uv
uv run python -m build

# Install package
uv pip install dist/hackbot-1.0.0-py3-none-any.whl

# Now you can use 'hackbot' or 'secbot' (no args = interactive mode)
hackbot
```

## 🎯 Quick Start

### Basic Usage (no arguments = interactive mode)

```bash
# Run with no arguments to enter interactive mode (takes over the terminal; exit restores it)
python main.py
# or
uv run secbot
# or (if installed) hackbot / secbot
```

All interaction (chat, agent switch, tools, slash commands) happens inside the interactive session. Type `/` then Enter to list commands; `exit` or `quit` to leave.

### In interactive mode (examples)

After starting with `python main.py` or `uv run secbot`, you can:

- **Web research**: e.g. "Research the latest CVE-2024 vulnerabilities and summarize", or "Use smart_search to find Python asyncio best practices", or "Use api_client with preset weather and query Beijing"
- **Recon / scanning**: e.g. "Scan ports on 192.168.1.1" or use slash commands like `/list-targets`, `/list-authorizations`, `/defense-scan`, `/defense-blocked`
- **Remote control / defense**: use slash commands such as `/list-targets`, `/list-authorizations`; other operations are available via natural language or `/` commands (type `/` then Enter to list all).

System info, database stats/history, voice, and prompt management are available inside the interactive session via slash commands (e.g. `/system-info`, `/db-stats`, `/db-history`, `/prompt-list`) or natural language. See in-app help (type `/` then Enter) for the full list.

### Terminal UI (TypeScript)

除 Python 自带的交互模式外，可用 **TypeScript 终端 TUI**（Ink）连接同一后端：

1. 先启动后端：`python -m router.main` 或 `uv run hackbot-server`
2. 在另一终端进入 `terminal-ui` 并运行：`npm install && npm run tui`

配置后端地址：环境变量 `SECBOT_API_URL` 或 `BASE_URL`（默认 `http://localhost:8000`）。可选一键启动：Windows 运行 `.\scripts\start-ts-tui.ps1`，Linux/macOS 运行 `./scripts/start-ts-tui.sh`。详见 [terminal-ui/README.md](terminal-ui/README.md)。

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
- [API Documentation](docs/API.md)
- [Mobile App Guide](docs/APP.md)
- [Skills & Memory System](docs/SKILLS_AND_MEMORY.md)
- [Database Guide](docs/DATABASE_GUIDE.md)
- [Docker Setup](docs/DOCKER_SETUP.md)
- [Ollama Setup](docs/OLLAMA_SETUP.md)
- [Security Warning](docs/SECURITY_WARNING.md)
- [Virtual Test Environment (VMware + Ubuntu)](docs/VIRTUAL_TEST_ENVIRONMENT.md) — prompts and setup for testing secbot in a VM
- [Prompt Guide](docs/PROMPT_GUIDE.md)
- [Speech Guide](docs/SPEECH_GUIDE.md)
- [SQLite Setup](docs/SQLITE_SETUP.md)
- [Deployment Guide](docs/DEPLOYMENT.md)

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
- CLI built with [Typer](https://typer.tiangolo.com)
- Beautiful output with [Rich](https://github.com/Textualize/rich)

## ⚠️ Disclaimer

This tool is provided for educational and authorized security testing purposes only. The authors and contributors are not responsible for any misuse or damage caused by this tool. Users must ensure they have proper authorization before using this tool on any system.

---

<div align="center">

**⭐ If you find this project useful, please consider giving it a star! ⭐**

</div>


