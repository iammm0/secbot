# secbot（原 hackbot）: 自动化渗透测试机器人

<div align="center">

**一个智能化的自动化渗透测试机器人，具备 AI 驱动的安全测试能力**

[English](README_EN.md) | [中文](#secbot原-hackbot-自动化渗透测试机器人)

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
- 🌐 **AI Web 研究子智能体**: 独立的 WebResearchAgent，基于 ReAct 自动完成联网搜索、网页提取、多页爬取和 API 调用
- 💻 **本地控制界面**: 提供简单直观的命令行入口与配置工具
- 🖥️ **持久化终端会话**: 为 hackbot 提供仅由智能体驱动的专用终端，会话内多步命令执行与系统信息收集
- 🎤 **语音交互**: 完整的语音转文字和文字转语音功能
- 🕷️ **AI 网络爬虫**: 实时网络信息捕获和监控
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

### Web 研究能力（联网能力）

- 🔎 **智能搜索**：基于 DuckDuckGo 的智能搜索 → 抓取结果页面 → 由 LLM 进行综合总结
- 📄 **网页提取**：按模式提取网页内容——纯文本、结构化（表格/列表）或自定义 AI schema
- 🕸️ **深度爬取**：从起始 URL 进行 BFS 多页爬取，支持深度/URL 过滤和可选 AI 提取
- 🔌 **API 客户端**：通用 REST API 客户端，内置天气、IP 信息、GitHub、汇率、DNS 等常用模板
- 🤖 **Web Research 工具**：既可委托给 WebResearchAgent 自主研究，也可由主智能体直接按模式调用 smart_search / page_extract / deep_crawl / api_client

### 附加功能

- 📝 **提示词链管理**: 灵活的智能体提示词配置
- 💾 **SQLite 数据库**: 持久化存储对话历史、提示词链、配置
- ⏰ **任务调度**: 支持定时执行渗透测试任务
- 🎨 **终端输出优化**: 支持颜色化日志与结构化输出，便于阅读与排错

## 🧩 架构与多智能体协作

为了便于理解 secbot 内部各层组件与多智能体之间的协作关系，这里给出一个**尽量完整且可对照源码的架构说明**。

> **提示**：下面先给出一张静态架构图（`assets/secbot_architecture.png`），便于在 GitHub / 代码托管平台中直接预览；其详细文字说明与对应源码文件请参考本节后续内容与 mermaid 图。

![Secbot 架构总览（前端 / 路由 / Planner / 多智能体 / Tools / Summary / EventBus / 存储）](assets/secbot_architecture.png)

### 整体架构一览（按源码模块拆分）

```mermaid
flowchart LR
  %% ---------------- 前端入口层 ----------------
  subgraph Frontend / Clients
    user[用户]
    tui[TUI / CLI\n(terminal-ui)]
    app[Mobile App\n(React Native)]
  end

  user --> tui
  user --> app

  tui -->|HTTP / SSE| api[FastAPI /api/chat\nrouter/chat.py]
  app -->|HTTP / SSE| api

  %% ---------------- 后端路由 & 会话编排 ----------------
  subgraph Backend Router & Session
    api --> sessionMgr[SessionManager\ncore/session.py]
    sessionMgr --> eb[EventBus\nutils/event_bus.py]
  end

  %% ---------------- 规划 & 执行编排 ----------------
  subgraph Planning & Execution
    sessionMgr --> planner[PlannerAgent\ncore/agents/planner_agent.py]
    planner --> planResult[PlanResult + Todos\n(core/models.py: TodoItem,\nresource, risk_level, agent_hint)]
    planResult --> executor[TaskExecutor\ncore/executor.py]
  end

  %% ---------------- 多智能体协调层 ----------------
  subgraph Agent Orchestration
    executor -->|按层并行调用\nget_execution_order() 结果| coord[CoordinatorAgent (Hackbot)\ncore/agents/coordinator_agent.py]

    subgraph Specialist Agents\n(core/agents/specialist_agents.py)
      net[NetworkReconAgent]
      web[WebPentestAgent]
      osint[OSINTAgent]
      term[TerminalOpsAgent]
      defend[DefenseMonitorAgent]
    end
  end

  coord -->|network_recon| net
  coord -->|web_pentest| web
  coord -->|osint| osint
  coord -->|terminal_ops| term
  coord -->|defense_monitor| defend

  %% ---------------- 工具层（Tools） ----------------
  subgraph Tools
    toolsNet[(网络探测工具集\nCORE_SECURITY_TOOLS + NETWORK_TOOLS\n tools/pentest/security.py,\n tools/pentest/network/…)]
    toolsWeb[(Web 渗透工具集\nWEB_TOOLS\n tools/web/…)]
    toolsOsint[(OSINT + WebResearch\nOSINT_TOOLS + WEB_RESEARCH_TOOLS\n tools/osint/…\n tools/web_research/…)]
    toolsTerm[(终端会话\nTerminalSessionTool\n tools/offense/control/terminal_tool.py)]
    toolsDef[(防御 / 自检工具\nDEFENSE_TOOLS\n tools/defense/…)]
  end

  net --> toolsNet
  web --> toolsWeb
  osint --> toolsOsint
  term --> toolsTerm
  defend --> toolsDef

  %% ---------------- 总结与存储 ----------------
  subgraph Summary & Storage
    coord --> summary[SummaryAgent\ncore/agents/summary_agent.py]
    summary --> db[SQLite\n数据库层\n(database/manager.py,\n hackbot_config/data/secbot.db)]
  end

  summary --> sessionMgr

  %% ---------------- 事件流 & 前端渲染 ----------------
  eb -->|PLAN_* / THINK_* / EXEC_* /\nCONTENT / REPORT_END / ERROR\n(均带 agent 字段)| sse[SSE 流\nrouter/chat.py → /api/chat]

  sse --> appUI[ChatScreen.tsx\n(app/src/screens/ChatScreen.tsx)\nThinkingBlock / ExecutionBlock /\nReportBlock / ResponseBlock]
  sse --> tuiUI[终端 UI 渲染\n(terminal-ui)]
```

### 关键设计思路（按层展开）

#### 1. 路由与会话编排层（router/chat.py + core/session.py）

- **入口路由 `router/chat.py`**
  - `/api/chat`（SSE）：将前端请求封装为 `ChatRequest`，创建 `EventBus`，订阅关键事件类型（`PLAN_START/THINK_*/EXEC_*/CONTENT/REPORT_END/ERROR` 等），然后调用 `SessionManager.handle_message()`。
  - `_event_to_sse()`：把 EventBus 事件映射为前端可消费的 SSE 事件，并将 `data.agent` 一路透传给前端，便于区分不同 Agent 的输出。
- **SessionManager（会话编排器）**
  - 负责一次完整交互的三阶段流程：
    1. 路由：判断是否直接走 QA / 闲聊回复，还是进入技术流（Planner + Hackbot）。
    2. 规划：调用 `PlannerAgent.plan()` 生成 `PlanResult`，并经 `EventBus` 广播规划摘要与 Todos。
    3. 执行：根据 Todos 是否存在以及 Agent 能力，选择：
       - 分层执行模式：`TaskExecutor + CoordinatorAgent`（推荐路径，支持多 Agent 并行）。
       - 兼容模式：直接调用 ReAct 风格的 `agent.process()`。
  - 对 Agent 的回调事件统一经过 `_bridge_agent_event()` 包装，补上 `agent` 字段，同时自动更新 Planner 中 Todo 的执行状态（`PLAN_TODO` 事件）。

#### 2. PlannerAgent：结构化规划 + 资源/风险感知

- 将用户请求拆解为 `TodoItem` 列表，每个 Todo 带上：
  - `depends_on`：依赖关系（形成有向无环图）。
  - `resource`：目标资产标识，例如：
    - `host:192.168.1.10` / `subnet:192.168.1.0/24`
    - `web:https://example.com`
    - `domain:example.com` / `osint:<关键字>`
  - `risk_level`：`low` / `medium` / `high`，根据工具类型与描述粗略推断（如 exploit / fuzz / brute 等归为高风险）。
  - `agent_hint`：推荐由哪个子 Agent 执行（network_recon / web_pentest / osint / terminal_ops / defense_monitor）。
- `get_execution_order()`：
  - 先按 `depends_on` 对 Todos 做拓扑排序，保证依赖拓扑正确。
  - 在每一拓扑层内，根据 `resource` 与 `risk_level` 进一步划分实际执行层：
    - 同一资源上 `risk_level="high"` 的 Todo 不会出现在同一执行层内，强制串行。
    - 尊重全局并行上限 `max_parallel_per_layer`，避免一次性打爆系统。
  - 返回 `List[List[todo_id]]`，供 `TaskExecutor` 按层并发执行。

#### 3. TaskExecutor：分层并发执行器（core/executor.py）

- 根据 `PlannerAgent.get_execution_order()` 的层级顺序执行：
  - 单 Todo 的层：串行执行，直接向前端发送事件。
  - 多 Todo 的层：使用 `asyncio.gather` 并发执行，执行完成后再按计划顺序线性发射事件，保证前端展示顺序与规划一致。
- 上下文聚合策略：
  - `by_todo`：以 `todo_id` 为 key 的结果映射（兼容旧逻辑）。
  - `by_resource`：以 `resource` 为 key 的结果列表，挂在 `context["_by_resource_"]` 下，方便后续步骤/子 Agent 按资产维度复用前置信息。

#### 4. CoordinatorAgent（Hackbot 主体）：多子 Agent 协同

- 对外仍暴露为 `"hackbot"`，但内部不再直接调用具体工具，而是：
  - 在普通 `process()` 模式下，委托给历史的 `HackbotAgent`，保持兼容。
  - 在分层执行模式下，通过 `execute_todo()` 按 Todo 的 `agent_hint / resource / tool_hint` 选择对应的专职子 Agent：
    - `network_recon` → `NetworkReconAgent`
    - `web_pentest` → `WebPentestAgent`
    - `osint` → `OSINTAgent`
    - `terminal_ops` → `TerminalOpsAgent`
    - `defense_monitor` → `DefenseMonitorAgent`
  - 若无法匹配，则退回默认 `HackbotAgent`。
- 在每次 `execute_todo()` 后，将结果按 Agent 维度聚合到 `_agent_results` 中，最终交给 `SummaryAgent` 做「多 Agent 汇总报告」。

#### 5. 专职子 Agent：窄而深的 ReAct 能力

- 所有子 Agent 继承自 `SecurityReActAgent`，拥有：
  - 独立的系统提示词（明确各自职责，如“只做网络扫描”“只做 Web 基础渗透”等）。
  - 独立的工具集：
    - `NetworkReconAgent`：`CORE_SECURITY_TOOLS + NETWORK_TOOLS`
    - `WebPentestAgent`：`WEB_TOOLS`
    - `OSINTAgent`：`OSINT_TOOLS + WEB_RESEARCH_TOOLS`
    - `TerminalOpsAgent`：`TerminalSessionTool`
    - `DefenseMonitorAgent`：`DEFENSE_TOOLS`
  - 自己的会话摘要 `_session_context_summary`，用于跨轮记忆；Coordinator 在每轮结束时会调用 `append_turn_to_session_context()` 同步本轮关键结论。

#### 6. SummaryAgent：多 Agent 结果汇总（core/agents/summary_agent.py）

- 接收：
  - 规划结果 `PlanResult.todos`（包含每步的完成状态与 `result_summary`）。
  - ReAct 思考 / 观察历史（`_react_history`）。
  - 聚合后的工具执行结果（含「按 Agent 维度」的 `_agent_results`）。
- 输出：
  - 结构化报告（Markdown），包括：任务总结、Todo 完成情况、关键发现、风险评估、修复建议、综合结论等。
  - 按 Agent 维度的局部总结，例如：
    - 「一、外部情报（来自 OSINTAgent）」  
    - 「二、网络攻击面（来自 NetworkReconAgent）」  
    - 「三、Web 资产安全状况（来自 WebPentestAgent）」等。

#### 7. 事件流与前端渲染（EventBus + SSE + 前端组件）

- `SecurityReActAgent._emit_event()` 为所有事件自动附加 `agent` 字段（优先 `self.agent_type`，其次 `self.name`）。
- `SessionManager._bridge_agent_event()` 会将这些事件映射为 `EventBus` 的标准事件类型：
  - 思考类：`THINK_START / THINK_CHUNK / THINK_END`
  - 执行类：`EXEC_START / EXEC_RESULT`
  - 内容类：`CONTENT`（包含规划说明 / 观察信息等）
  - 报告类：`REPORT_END`
  - 错误类：`ERROR`
- `router/chat.py::_event_to_sse()` 将上述事件转成前端 SSE 事件：
  - 例如 `THINK_CHUNK` → `thought_chunk`，`EXEC_START` → `action_start`，并透传 `agent`。
- 前端（`ChatScreen.tsx`）根据 `agent` 字段在 UI 上作区分：
  - `ThinkingBlock` / `ExecutionBlock` 头部会显示 `[network_recon]` / `[web_pentest]` 等标签，明确当前思考/动作来自哪个子 Agent。
  - 将用户请求拆解为 `TodoItem` 列表，每个 Todo 带上 `depends_on`、`resource`（如 `host:192.168.1.10`、`web:https://example.com`）、`risk_level` 以及 `agent_hint`。
  - 通过 `get_execution_order()` 基于依赖关系 + 资源 / 风险做「安全可控的并行」：同一资源上的高危步骤强制串行，不同资源之间尽量并行。

- **TaskExecutor：分层并发执行器**
  - 根据 `PlannerAgent.get_execution_order()` 输出的层级执行顺序，逐层执行 Todo：层内可并行，层间严格按依赖拓扑前进。
  - 在传给 Agent 的 `context` 中，既保留按 `todo_id` 的结果映射，又额外按 `resource` 聚合结果（`context["_by_resource_"]`），方便后续步骤或子 Agent 直接基于同一资产历史信息进行推理。

- **CoordinatorAgent（Hackbot 主体）：多子 Agent 协同**
  - 对外仍以 `"hackbot"` 身份暴露，但内部不再单体执行，而是**根据每个 Todo 的 `agent_hint/resource/tool_hint`** 将执行委派给相应的专职子 Agent：
    - `network_recon` → `NetworkReconAgent`
    - `web_pentest` → `WebPentestAgent`
    - `osint` → `OSINTAgent`
    - `terminal_ops` → `TerminalOpsAgent`
    - `defense_monitor` → `DefenseMonitorAgent`
  - Coordinator 本身只负责路由与结果聚合，不直接运行具体安全工具。

- **专职子 Agent：窄而深的 ReAct 能力**
  - 所有子 Agent 继承自 `SecurityReActAgent`，拥有各自的系统提示词和专属工具集，仅在自己负责的域内做 ReAct 推理和工具调用。
  - 每个子 Agent 都维护自己的会话摘要（短记忆），Coordinator 在每轮任务结束后将摘要同步到所有 Agent，保证下一个任务能参考历史情报。

- **SummaryAgent：多 Agent 结果汇总**
  - 从 Coordinator 聚合到的「按 agent 维度的工具执行结果」中，生成分节式的最终报告，例如：网络攻击面、Web 安全状况、外部情报、本机防御等，清晰体现多智能体协作过程。

- **EventBus + SSE：带 agent 标签的事件流**
  - 所有 THINK / EXEC / REPORT 事件都会带上 `agent` 字段，前端（`ChatScreen.tsx`）在渲染 `ThinkingBlock`、`ExecutionBlock` 等组件时，会标注 `[network_recon]` / `[web_pentest]` / `[osint]` 等来源，便于用户理解每一步是由哪个智能体完成的。

### 仓库命名说明

- GitHub 远程仓库现已统一为 **`secbot`**，项目早期名称为 **hackbot**，文档中的命令和包名会逐步迁移为 `secbot`（保留 `hackbot` 作为兼容入口）。

---

## 📋 系统要求

- Python 3.10+
- [uv](https://github.com/astral-sh/uv) - 快速 Python 包管理器
- Ollama (用于 LLM 推理)
- 依赖在 `pyproject.toml` 中管理

## 📦 发布版（免 Python 安装）

若不想安装 Python，可直接使用**单文件可执行程序**（Windows / macOS / Linux）：

1. 在 [Releases](https://github.com/iammm0/secbot/releases) 下载对应平台 zip（如 `secbot-linux-amd64.zip`），解压得到 `secbot` 目录。
2. **配置 DeepSeek API Key**（启动前唯一必须条件）：环境变量 `DEEPSEEK_API_KEY=sk-xxx`，或在 `secbot` 目录内创建 `.env` 写入该变量。
3. 进入 `secbot` 目录，运行 `./secbot`（Linux/macOS）或 `secbot.exe`（Windows）即可进入交互式界面。

详见 [发布版使用说明](docs/RELEASE.md)。

---

## 🛠️ 安装（从源码运行）

### 1. 克隆仓库

```bash
git clone https://github.com/iammm0/secbot.git
cd secbot
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

# 安装包（包名为 secbot，版本见 pyproject.toml）
uv pip install dist/secbot-*.whl

# 现在可直接使用 hackbot / secbot（无参数即交互模式）
secbot
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
- **API Key 配置说明**：API Key（如 DeepSeek / Groq / OpenRouter 等）推荐通过前端/TUI 内的设置或 `/model` 等配置入口完成，不再提供独立的 Typer+Rich CLI 配置命令；底层仍按 [配置与环境变量范式](docs/design-paradigms/config-and-env.md) 约定使用 `.env` + keyring/数据库安全存储敏感信息。

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

- 本项目基于众多优秀的开源项目构建，在此向所有参与其中的个人与社区致以诚挚感谢（以下仅为部分代表，排名不分先后，**包括但不限于**）：
  - 语言与运行时：**Python**、**TypeScript/JavaScript**、**Node.js**
  - 后端框架与基础设施：**FastAPI**、**Starlette / sse-starlette**、**uvicorn**、**uv**、**SQLite**
  - LLM 与 AI 生态：**LangChain**、`langchain-openai`、`langchain-anthropic`、`langchain-google-genai`、`langchain-community`、**DeepSeek/OpenAI/Anthropic/Google Gemini 等云端推理服务**、**Ollama**
  - 终端与日志：终端布局/渲染与日志相关组件（如 **loguru** 等）
  - 安全与网络相关：项目中集成和封装的各类安全/网络/OSINT 工具及其依赖（如 nmap/scapy 等），感谢这些工具长期维护者
  - 前端与移动端：**React**、**React Native**、**Expo**、**Ink**、**React Navigation** 以及相关 UI / 状态管理生态
  - 其他依赖库：`requests/httpx`、`pydantic`、`sqlalchemy` 等在项目中被直接或间接使用的第三方库

> 若有任何开源项目未在上文列出而已被本项目使用，属疏漏之处，亦在此一并致谢。

## ⚠️ 免责声明

本工具仅用于教育和授权的安全测试目的。作者和贡献者不对因使用本工具造成的任何误用或损害负责。用户在使用本工具对任何系统进行测试之前，必须确保已获得适当的授权。

---

<div align="center">

**⭐ 如果您觉得这个项目有用，请考虑给它一个星标！⭐**

</div>