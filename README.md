# secbot（原 hackbot）: 自动化渗透测试机器人

<div align="center">

**一个智能化的自动化渗透测试机器人，具备 AI 驱动的安全测试能力**

[中文](README_CN.md) | [English](README_EN.md)

</div>

---

> **说明**：本仓库默认使用中文作为主文档语言。  
> 详细功能介绍、架构设计、多智能体协作说明等内容，请优先参考 `README_CN.md`；英文版请查看 `README_EN.md`。

- 若你希望快速了解项目整体，请直接阅读 `README_CN.md`。
- 若你更习惯英文文档，可从 `README_EN.md` 开始阅读，其内容会尽量与中文保持同步。

### 项目架构总览（预览）

为了在 GitHub 等代码托管平台中快速预览整体架构，这里直接嵌入一张静态架构图（详细分层说明见 `README_CN.md` 的「架构与多智能体协作」一节）。

![Secbot 架构总览（前端 / 路由 / Planner / 多智能体 / Tools / Summary / EventBus / 存储）](assets/secbot_architecture.png)

- **PlannerAgent: structured, resource-aware planning**
  - Breaks the user request into a list of `TodoItem`s, each with `depends_on`, `resource` (e.g. `host:192.168.1.10`, `web:https://example.com`), `risk_level`, and `agent_hint`.
  - `get_execution_order()` uses dependency DAG + resource/risk to build a **safe parallel plan**: high-risk steps on the same resource are forced to run sequentially, independent resources are run in parallel where possible.

- **TaskExecutor: layered parallel executor**
  - Consumes `PlannerAgent.get_execution_order()` and executes Todos layer by layer: within a layer, tasks can be run in parallel; between layers, dependencies are honored strictly.
  - Builds the `context` passed to agents with both per-todo results and a resource-centric view (`context["_by_resource_"]`), so later steps and sub-agents can easily reuse prior findings on the same asset.

- **CoordinatorAgent (Hackbot core): multi-agent routing**
  - Exposed externally as `"hackbot"`, but internally does **not** run tools directly; instead, it routes each Todo to a **specialist agent** based on `agent_hint` / `resource` / `tool_hint`:
    - `network_recon` → `NetworkReconAgent`
    - `web_pentest` → `WebPentestAgent`
    - `osint` → `OSINTAgent`
    - `terminal_ops` → `TerminalOpsAgent`
    - `defense_monitor` → `DefenseMonitorAgent`
  - Coordinator is responsible for routing and result aggregation only; concrete security tools live in the specialist agents.

- **Specialist Agents: narrow but deep ReAct loops**
  - All specialist agents inherit from `SecurityReActAgent`, with dedicated system prompts and tool-sets limited to their domain.
  - Each maintains its own short-term session summary; at the end of an interaction, the Coordinator updates all agents’ summaries so the next task can leverage past intelligence.

- **SummaryAgent: multi-agent report aggregation**
  - Consumes agent-scoped tool results aggregated by the Coordinator and produces a structured report, e.g. sections for network attack surface, web security posture, OSINT findings, terminal/host state, and defense/alerts.

- **EventBus + SSE: agent-tagged event stream**
  - All THINK/EXEC/REPORT events carry an `agent` field. The frontend (`ChatScreen.tsx`) renders `ThinkingBlock` and `ExecutionBlock` components with labels such as `[network_recon]`, `[web_pentest]`, `[osint]`, making it clear which agent performed each step.

### Repository Naming

- The GitHub repository has been renamed to **`secbot`** (formerly **hackbot**). CLI entry points keep both names for compatibility, but new docs and examples prefer `secbot`.

---

## 📋 Requirements

- Python 3.10+
- [uv](https://github.com/astral-sh/uv) - Fast Python package manager
- Ollama (for LLM inference)
- Dependencies are managed in `pyproject.toml`

## 🛠️ Installation

### 1. Clone the Repository

```bash
git clone https://github.com/iammm0/secbot.git
cd secbot
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
- **API Key configuration**: API keys (e.g. DeepSeek / Groq / OpenRouter) are configured via the TUI/frontend settings or in-app commands (such as `/model`), not via a standalone Typer+Rich CLI anymore. Internally, secbot still follows [config-and-env](docs/design-paradigms/config-and-env.md), using `.env` plus keyring/database for secure storage.

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

secbot is built on top of a rich open-source ecosystem. We would like to express our sincere gratitude to all projects and communities that made this possible (**including but not limited to**, in no particular order):

- Languages & runtimes: **Python**, **TypeScript/JavaScript**, **Node.js**
- Backend & infrastructure: **FastAPI**, **Starlette / sse-starlette**, **uvicorn**, **uv**, **SQLite**
- LLM & AI ecosystem: **LangChain**, `langchain-openai`, `langchain-anthropic`, `langchain-google-genai`, `langchain-community`, various **DeepSeek / OpenAI / Anthropic / Google Gemini** compatible APIs, and **Ollama** for local inference
- Terminal & logging: terminal / logging related tooling (e.g. **loguru** and others)
- Security & networking: the numerous security, networking and OSINT tools (e.g. nmap, scapy, etc.) that are wrapped or integrated by this project, and their maintainers
- Frontend & mobile: **React**, **React Native**, **Expo**, **Ink**, **React Navigation** and the surrounding UI / state-management ecosystem
- Other dependencies: `requests/httpx`, `pydantic`, `sqlalchemy` and many other third-party libraries directly or transitively used in this repository

> If we are using your open-source project but failed to list it explicitly above, please accept our apologies — we are equally grateful for your work.

## ⚠️ Disclaimer

This tool is provided for educational and authorized security testing purposes only. The authors and contributors are not responsible for any misuse or damage caused by this tool. Users must ensure they have proper authorization before using this tool on any system.

---

<div align="center">

**⭐ If you find this project useful, please consider giving it a star! ⭐**

</div>



