<div align="center">

<h1>Secbot</h1>

<p><strong>AI 驱动的安全自动化平台</strong> — 多智能体编排，集成 <strong>ACP</strong>、<strong>MCP</strong> 与 <strong>Skills</strong>，并支持类 opencode 的计划与编辑语义。</p>

<p>
  <a href="https://www.python.org/downloads/"><img src="https://img.shields.io/badge/python-3.11%2B-blue.svg" alt="Python"></a>
  <a href="pyproject.toml"><img src="https://img.shields.io/badge/version-1.6.0-brightgreen.svg" alt="Version"></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-orange.svg" alt="License"></a>
  <img src="https://img.shields.io/badge/platform-Windows%20%7C%20Linux%20%7C%20macOS-lightgrey.svg" alt="Platform">
</p>

<p>
  <a href="README.md">English (主 README)</a> · 中文
</p>

![Secbot 主界面](assets/secbot-main.png)

</div>

---

> **安全与法律声明**  
> 本软件**仅用于经授权的安全测试、攻防演练与防御向研究**。对未授权目标使用可能违法。使用前请阅读 [docs/SECURITY_WARNING.md](docs/SECURITY_WARNING.md)。

---

## 目录

- [项目简介](#项目简介)
- [功能特性](#功能特性)
- [架构说明](#架构说明)
- [环境要求](#环境要求)
- [安装](#安装)
- [配置](#配置)
- [使用方式](#使用方式)
- [可选扩展](#可选扩展)
- [测试](#测试)
- [文档索引](#文档索引)
- [参与贡献](#参与贡献)
- [许可证](#许可证)
- [致谢](#致谢)

---

## 项目简介

Secbot 是一个面向**安全自动化**的 **AI Agent 平台**，以 **Python Monorepo** 交付，整合：

- **ACP（Agent Client Protocol）** — 对外部客户端暴露会话生命周期与流式事件；实现见 `apps/opencode-gateway/`。
- **MCP（Model Context Protocol）** — 发现并调用本地或远程 MCP 工具服务。
- **Skills** — 原生 Secbot 技能与 opencode 风格技能目录的统一发现与注入。
- **规划与执行** — Planner + 分层执行器，支持 `agent` / `plan` / `ask` 等模式。

默认体验为 **终端全屏 TUI**（Ink + TypeScript）+ **FastAPI** 后端；也可单独启动 API 或 ACP 网关。

---

## 功能特性

- **多智能体编排**：Planner + 分层执行器。
- **ACP 网关**：stdio 上的 ND-JSON，兼容 ACP 客户端（`secbot-acp`）。
- **MCP**：通过根目录 `opencode.json` 注册 `local` / `remote` 服务并动态封装为工具。
- **统一 Skills**：在特性开关下合并 Secbot 原生与外部/opencode 风格技能路径。
- **权限模型**：高风险操作支持 `allow` / `ask` / `deny`（需启用相关开关）。
- **特性开关**：通过环境变量灰度启用 ACP、MCP、统一技能、编辑工具、计划模式与权限等。
- **多推理后端**：本地 Ollama 与多家云端 API；列表见 [docs/LLM_PROVIDERS.md](docs/LLM_PROVIDERS.md)。

---

## 架构说明

```text
apps/
  secbot-api/          # FastAPI 路由与 HTTP/SSE
  secbot-cli/          # CLI / TUI 启动与交互入口
  opencode-gateway/    # ACP 网关（stdio ND-JSON）

packages/
  secbot-core/         # 会话、规划、执行图
  secbot-tools/        # 内置工具与系统能力
  secbot-skills/       # 原生技能实现
  shared-config/       # 共享配置、特性开关、MCP 配置加载
  opencode-adapters/   # MCP / 技能 / 编辑 / 权限适配层

terminal-ui/           # TypeScript + Ink TUI（需 Node.js 22+）
desktop/               # Tauri + Vite 桌面壳（可选）
mobile/                # 移动端工程（可选）
```

迁移与整体设计见 [docs/MONOREPO_MIGRATION.md](docs/MONOREPO_MIGRATION.md)。

---

## 环境要求

| 组件 | 说明 |
|------|------|
| **Python** | 3.11 及以上（与 [pyproject.toml](pyproject.toml) 中 `requires-python` 一致） |
| **操作系统** | Windows、Linux、macOS（部分可选依赖如部分 SQLite 向量扩展在 Windows 上按标记**不安装**，以 `pyproject.toml` 为准） |
| **Node.js** | **22+**（若从 `terminal-ui/` 运行 Ink TUI；见 [docs/NODE_SETUP.md](docs/NODE_SETUP.md)） |
| **大模型** | 例如本地 [Ollama](https://ollama.ai)，或配置云端 API Key（[docs/LLM_PROVIDERS.md](docs/LLM_PROVIDERS.md)） |

Playwright、Selenium 等随 Python 依赖安装；浏览器驱动请遵循各厂商文档。

---

## 安装

### 可编辑安装（开发推荐）

在仓库根目录：

```bash
python -m pip install -e .
```

### 使用 uv

```bash
uv pip install -e .
```

### 可选依赖组

```bash
# 开发工具
python -m pip install -e ".[dev]"

# 额外 LLM 厂商（见 pyproject.toml）
python -m pip install -e ".[anthropic]"
python -m pip install -e ".[google]"
python -m pip install -e ".[all-providers]"

# 可选漏洞利用相关集成
python -m pip install -e ".[exploit-tools]"
```

安装后的控制台入口（见 [pyproject.toml](pyproject.toml)）：**`secbot`**、**`secbot-cli`**、**`hackbot`**（CLI）、**`secbot-server`** / **`hackbot-server`**（API）、**`secbot-acp`**（ACP 网关）。

---

## 配置

### 环境变量

- 在项目根目录按需创建 **`.env`**。文档中若提到 `env.example`，请以仓库内实际文件为准；约定见 [docs/QUICKSTART.md](docs/QUICKSTART.md) 与 [docs/design-paradigms/config-and-env.md](docs/design-paradigms/config-and-env.md)。
- **LLM**：设置 `LLM_PROVIDER` 及各厂商 Key，详见 [docs/LLM_PROVIDERS.md](docs/LLM_PROVIDERS.md)。Ollama 见 [docs/OLLAMA_SETUP.md](docs/OLLAMA_SETUP.md)。

### 功能灰度开关

| 变量 | 说明 |
|------|------|
| `SECBOT_ACP_ENABLED` | ACP 相关能力 |
| `SECBOT_MCP_ENABLED` | MCP 集成 |
| `SECBOT_UNIFIED_SKILLS` | 统一技能加载 |
| `SECBOT_EDIT_TOOLS` | 编辑类工具 |
| `SECBOT_PLAN_MODE` | 计划模式 |
| `SECBOT_PERMISSIONS` | 权限策略 |

**Linux / macOS** 示例：

```bash
export SECBOT_ACP_ENABLED=true
export SECBOT_MCP_ENABLED=true
export SECBOT_UNIFIED_SKILLS=true
export SECBOT_EDIT_TOOLS=true
export SECBOT_PLAN_MODE=true
export SECBOT_PERMISSIONS=true
```

**Windows PowerShell** 示例：

```powershell
$env:SECBOT_MCP_ENABLED = "true"
```

### MCP（`opencode.json`）

在**项目根目录**创建 `opencode.json`：

```json
{
  "mcp": {
    "my-local": {
      "type": "local",
      "command": ["node", "./path/to/server.js"]
    },
    "my-remote": {
      "type": "remote",
      "url": "https://example.com/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_TOKEN"
      }
    }
  }
}
```

### Browser 子进程工具库（可选）

仓库提供了独立 JS 子包：`packages/secbot-browser-tools`，用于承载浏览器自动化能力并由 Python 侧调用。

```bash
cd packages/secbot-browser-tools
npm install
npm run build
```

可选：指定 Python 侧使用的子进程启动命令：

```powershell
$env:SECBOT_BROWSER_TOOLS_CMD = "node packages/secbot-browser-tools/dist/server.js"
```

### agent-browser CLI（可选）

如需执行浏览器自动化流程，建议安装 `agent-browser`：

```powershell
npm install -g agent-browser
agent-browser install
```

若 `agent-browser install` 因网络失败，可直接使用本机 Chrome（Windows）：

```powershell
$env:AGENT_BROWSER_EXECUTABLE_PATH = "C:\Program Files\Google\Chrome\Application\chrome.exe"
```

### 多浏览器工具后端（新增）

`packages/secbot-browser-tools` 现在支持多后端：

- `agent-browser`（默认，适合已有 agent-browser 工作流）
- `playwright`（无需安装 agent-browser，直接走 Playwright）

通过环境变量切换：

```powershell
$env:SECBOT_BROWSER_PROVIDER = "playwright"
```

或显式指定 agent-browser：

```powershell
$env:SECBOT_BROWSER_PROVIDER = "agent-browser"
```

---

## 使用方式

### 根目录 `main.py`

仓库根目录 [main.py](main.py) 默认先启**后端**再启 **TypeScript TUI**：

```bash
python main.py              # 后端 + 全屏 TUI
python main.py --backend    # 仅 API
python main.py --tui        # 仅 TUI（需后端已运行）
```

### 已安装命令

```bash
secbot-server               # 或: python main.py --backend
secbot-cli                  # 默认：后端 + 全屏 TUI（与 secbot / hackbot 相同）
secbot-cli --backend        # 仅 API（默认 http://127.0.0.1:8000）
secbot-cli --tui            # 仅 TUI（需先启动后端）
secbot-cli model            # 交互选择推理后端与模型（写入 SQLite）
secbot-cli --help
secbot / hackbot            # 与 secbot-cli 同一入口模块

python -m opencode_gateway.main
secbot-acp                  # 安装后的 ACP 网关入口
```

### TUI（Ink）

```bash
cd terminal-ui
npm install
npm run tui
```

详见 [terminal-ui/README.md](terminal-ui/README.md) 与 [docs/UI-DESIGN-AND-INTERACTION.md](docs/UI-DESIGN-AND-INTERACTION.md)。

### Docker 与部署

[docs/DOCKER_SETUP.md](docs/DOCKER_SETUP.md)、[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)。

---

## 可选扩展

- **工具扩展**：第三方包可通过 setuptools entry point 注册工具 — [docs/TOOL_EXTENSION.md](docs/TOOL_EXTENSION.md)。
- **桌面端**：`desktop/`（Tauri + Vite），脚本见 `desktop/package.json`。
- **数据库 / SQLite**：[docs/DATABASE_GUIDE.md](docs/DATABASE_GUIDE.md)、[docs/SQLITE_SETUP.md](docs/SQLITE_SETUP.md)。

---

## 测试

```bash
python -m pytest tests/ -v
```

Monorepo 集成冒烟：

```bash
python -m pytest tests/test_monorepo_integration.py -v
```

---

## 文档索引

| 文档 | 说明 |
|------|------|
| [docs/QUICKSTART.md](docs/QUICKSTART.md) | 分步快速上手 |
| [docs/API.md](docs/API.md) | HTTP API 概览 |
| [docs/LLM_PROVIDERS.md](docs/LLM_PROVIDERS.md) | 已支持推理后端 |
| [docs/SKILLS_AND_MEMORY.md](docs/SKILLS_AND_MEMORY.md) | 技能与记忆 |
| [docs/MONOREPO_MIGRATION.md](docs/MONOREPO_MIGRATION.md) | Monorepo 与迁移 |
| [docs/SECURITY_WARNING.md](docs/SECURITY_WARNING.md) | 安全与法律声明 |
| [docs/CHANGELOG.md](docs/CHANGELOG.md) | 变更记录 |
| [docs/design-paradigms/](docs/design-paradigms/) | 设计范式与深度说明 |

---

## 参与贡献

欢迎通过 **Issue** 与 **Pull Request** 参与。

1. 仅在**合法授权**场景下使用与验证本仓库能力。
2. 代码风格与 [pyproject.toml](pyproject.toml) 中的 Black 配置一致（行宽 120）。
3. 对修改范围运行 `pytest`。
4. PR 中说明**动机**与**影响面**。

提交信息约定见 [docs/design-paradigms/commit-conventions.md](docs/design-paradigms/commit-conventions.md)。

**仓库链接**（与包元数据一致）：[源码](https://github.com/iammm0/hackbot) · [Issues](https://github.com/iammm0/hackbot/issues)

---

## 许可证

本项目采用 [MIT License](LICENSE) 授权。

---

## 致谢

构建基于 [LangChain](https://github.com/langchain-ai/langchain)、[LangGraph](https://github.com/langchain-ai/langgraph)、[FastAPI](https://fastapi.tiangolo.com/) 等，完整依赖见 [pyproject.toml](pyproject.toml)。
