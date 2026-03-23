# Secbot v1.0.1 发布说明

<cite>
**本文档引用的文件**
- [README.md](file://README.md)
- [docs/RELEASE_v1.0.1.md](file://docs/RELEASE_v1.0.1.md)
- [pyproject.toml](file://pyproject.toml)
- [main.py](file://main.py)
- [router/main.py](file://router/main.py)
- [hackbot/cli.py](file://hackbot/cli.py)
- [utils/llm_http_fallback.py](file://utils/llm_http_fallback.py)
- [terminal-ui/src/App.tsx](file://terminal-ui/src/App.tsx)
- [terminal-ui/package.json](file://terminal-ui/package.json)
- [terminal-ui/src/views/SessionView.tsx](file://terminal-ui/src/views/SessionView.tsx)
- [core/agents/planner_agent.py](file://core/agents/planner_agent.py)
- [core/executor.py](file://core/executor.py)
- [docs/LLM_PROVIDERS.md](file://docs/LLM_PROVIDERS.md)
</cite>

## 目录
1. [简介](#简介)
2. [项目结构](#项目结构)
3. [核心组件](#核心组件)
4. [架构概览](#架构概览)
5. [详细组件分析](#详细组件分析)
6. [依赖分析](#依赖分析)
7. [性能考虑](#性能考虑)
8. [故障排除指南](#故障排除指南)
9. [结论](#结论)
10. [附录](#附录)

## 简介

Secbot v1.0.1 是一个基于 AI 的自动化渗透测试智能体平台，专为授权的安全测试而设计。该版本在 v1.0.0 的基础上进行了多项重要改进，重点提升了智能体与终端 TUI 的用户体验，增强了 LLM 多提供商支持与 HTTP 回退能力，并完善了文档和终端控制工具。

**安全提醒**：本工具仅用于您拥有或已获得明确书面授权的系统。未经授权的使用可能违法，请遵守当地法律法规。

## 项目结构

Secbot 采用模块化的分层架构设计，主要包含以下核心组件：

```mermaid
graph TB
subgraph "前端层"
TUI[终端 TUI]
RN[React Native 移动端]
end
subgraph "后端服务层"
API[FastAPI 服务]
Router[路由层]
Session[会话管理]
end
subgraph "智能体核心层"
Planner[规划智能体]
Executor[执行器]
Coordinator[协调器]
Specialists[专业智能体]
end
subgraph "工具层"
Offensive[进攻性工具]
Defensive[防御性工具]
WebTools[Web 渗透工具]
OSINT[情报收集工具]
end
subgraph "基础设施层"
DB[(SQLite 数据库)]
Memory[内存管理]
EventBus[事件总线]
end
TUI --> API
RN --> API
API --> Router
Router --> Session
Session --> Planner
Planner --> Executor
Executor --> Coordinator
Coordinator --> Specialists
Specialists --> Offensive
Specialists --> Defensive
Specialists --> WebTools
Specialists --> OSINT
Coordinator --> Memory
Session --> EventBus
EventBus --> TUI
```

**图表来源**
- [README.md:86-170](file://README.md#L86-L170)
- [router/main.py:19-71](file://router/main.py#L19-L71)

**章节来源**
- [README.md:353-376](file://README.md#L353-L376)
- [pyproject.toml:124-162](file://pyproject.toml#L124-L162)

## 核心组件

### 智能体架构

Secbot 的智能体系统采用多层协作架构，包含规划、执行和协调三个核心层次：

```mermaid
classDiagram
class PlannerAgent {
+plan(user_input, context) PlanResult
+process(user_input) str
+update_todo(todo_id, status, result_summary)
+get_execution_order() List[List[str]]
-_quick_classify(input) str
-_plan_technical_task_v2(input, context) PlanResult
}
class TaskExecutor {
+run(user_input, on_event) str
-_execute_single_todo(todo, user_input, iteration, on_event, emit_events) Dict
-_get_todo_by_id(todo_id) TodoItem
}
class CoordinatorAgent {
+route_to_specialist(agent_hint) SpecialistAgent
+coordinate_tasks(todos) Dict
}
class SpecialistAgent {
+execute_todo(todo, user_input, context, on_event, iteration, get_root_password, emit_events) Dict
+analyze_target(target) Dict
+perform_attack(target) Dict
}
PlannerAgent --> TaskExecutor : "生成执行计划"
TaskExecutor --> CoordinatorAgent : "协调执行"
CoordinatorAgent --> SpecialistAgent : "路由到专业智能体"
```

**图表来源**
- [core/agents/planner_agent.py:20-200](file://core/agents/planner_agent.py#L20-L200)
- [core/executor.py:17-197](file://core/executor.py#L17-L197)

### LLM 多提供商支持

v1.0.1 版本显著增强了 LLM 多提供商支持能力，新增了 HTTP 回退机制以提高系统可用性：

```mermaid
sequenceDiagram
participant Client as "客户端"
participant Planner as "规划智能体"
participant LLM as "LLM 提供商"
participant Fallback as "HTTP 回退"
Client->>Planner : 用户请求
Planner->>LLM : LLM 调用
LLM-->>Planner : 调用失败
Planner->>Fallback : HTTP 直接请求
Fallback-->>Planner : 返回结果
Planner-->>Client : 处理后的响应
```

**图表来源**
- [utils/llm_http_fallback.py:11-82](file://utils/llm_http_fallback.py#L11-L82)

**章节来源**
- [docs/RELEASE_v1.0.1.md:31-37](file://docs/RELEASE_v1.0.1.md#L31-L37)
- [docs/LLM_PROVIDERS.md:1-55](file://docs/LLM_PROVIDERS.md#L1-L55)

## 架构概览

### 系统架构

Secbot 采用前后端分离的微服务架构，通过 FastAPI 提供 REST API 和 SSE 事件流：

```mermaid
graph LR
subgraph "客户端"
Web[Web 浏览器]
Mobile[移动应用]
TUI[终端 TUI]
end
subgraph "API 网关"
FastAPI[FastAPI 服务]
CORS[CORS 中间件]
Health[健康检查]
end
subgraph "业务逻辑层"
Chat[聊天路由]
Agents[智能体路由]
Sessions[会话路由]
System[系统路由]
Defense[防御路由]
Network[网络路由]
Database[数据库路由]
Tools[工具路由]
end
subgraph "数据层"
SQLite[(SQLite 数据库)]
VectorStore[(向量存储)]
end
Web --> FastAPI
Mobile --> FastAPI
TUI --> FastAPI
FastAPI --> CORS
FastAPI --> Health
FastAPI --> Chat
FastAPI --> Agents
FastAPI --> Sessions
FastAPI --> System
FastAPI --> Defense
FastAPI --> Network
FastAPI --> Database
FastAPI --> Tools
Chat --> SQLite
Agents --> SQLite
Sessions --> SQLite
System --> SQLite
Defense --> SQLite
Network --> SQLite
Database --> SQLite
Tools --> SQLite
FastAPI --> VectorStore
```

**图表来源**
- [router/main.py:5-16](file://router/main.py#L5-L16)
- [router/main.py:19-71](file://router/main.py#L19-L71)

### 会话管理流程

```mermaid
flowchart TD
Start([用户连接]) --> InitSession[初始化会话]
InitSession --> LoadConfig[加载配置]
LoadConfig --> CreateAgent[创建智能体实例]
CreateAgent --> WaitInput[等待用户输入]
WaitInput --> ParseInput{解析输入类型}
ParseInput --> |问候/闲聊| QuickReply[快速回复]
ParseInput --> |技术请求| PlanTask[生成执行计划]
QuickReply --> SendResponse[发送响应]
PlanTask --> ExecuteTasks[执行任务]
ExecuteTasks --> CheckParallel{检查并行度}
CheckParallel --> |单任务| SerialExec[串行执行]
CheckParallel --> |多任务| ParallelExec[并行执行]
SerialExec --> UpdateStatus[更新状态]
ParallelExec --> UpdateStatus
UpdateStatus --> CheckComplete{任务完成?}
CheckComplete --> |否| WaitInput
CheckComplete --> |是| GenerateReport[生成报告]
GenerateReport --> SendResponse
SendResponse --> WaitInput
```

**图表来源**
- [core/agents/planner_agent.py:88-130](file://core/agents/planner_agent.py#L88-L130)
- [core/executor.py:46-151](file://core/executor.py#L46-L151)

## 详细组件分析

### 终端 TUI 组件

v1.0.1 版本对终端 TUI 进行了重大改进，增强了用户交互体验：

```mermaid
classDiagram
class App {
+dimensions : Dimensions
+render() JSX.Element
+handleInput(input, key) void
+setupCommands() void
}
class SessionView {
+history : Message[]
+inputValue : string
+blocks : ContentBlock[]
+render() JSX.Element
+handleInput(input, key) void
+scrollToNextBlock(direction) void
}
class CommandPanel {
+commands : Command[]
+selectedCommand : Command
+render() JSX.Element
}
class ModelConfigDialog {
+provider : string
+model : string
+apiKey : string
+render() JSX.Element
}
App --> SessionView : "渲染主视图"
SessionView --> CommandPanel : "显示命令面板"
SessionView --> ModelConfigDialog : "配置模型"
SessionView --> TextInput : "用户输入"
```

**图表来源**
- [terminal-ui/src/App.tsx:26-212](file://terminal-ui/src/App.tsx#L26-L212)
- [terminal-ui/src/views/SessionView.tsx:59-200](file://terminal-ui/src/views/SessionView.tsx#L59-L200)

#### 用户交互流程

```mermaid
sequenceDiagram
participant User as "用户"
participant TUI as "终端 TUI"
participant App as "App 组件"
participant Session as "SessionView"
participant API as "后端 API"
User->>TUI : 启动应用
TUI->>App : 初始化应用
App->>Session : 加载会话视图
Session->>API : 获取会话历史
API-->>Session : 返回历史消息
Session-->>User : 显示消息
User->>Session : 输入消息
Session->>API : 发送消息
API-->>Session : 流式响应
Session-->>User : 实时显示响应
User->>Session : 使用斜杠命令
Session->>API : 执行命令
API-->>Session : 返回结果
Session-->>User : 显示命令结果
```

**图表来源**
- [terminal-ui/src/App.tsx:166-185](file://terminal-ui/src/App.tsx#L166-L185)
- [terminal-ui/src/views/SessionView.tsx:174-200](file://terminal-ui/src/views/SessionView.tsx#L174-L200)

**章节来源**
- [docs/RELEASE_v1.0.1.md:24-29](file://docs/RELEASE_v1.0.1.md#L24-L29)
- [terminal-ui/src/App.tsx:1-212](file://terminal-ui/src/App.tsx#L1-L212)

### CLI 入口组件

v1.0.1 版本对 CLI 入口进行了优化，提供了更清晰的用户指导：

```mermaid
flowchart TD
Start([启动 CLI]) --> ParseArgs{解析参数}
ParseArgs --> |--help| ShowHelp[显示帮助信息]
ParseArgs --> |--backend| RunBackend[运行后端服务]
ParseArgs --> |--tui| RunTUI[运行终端 TUI]
ParseArgs --> |model| ModelConfig[模型配置]
ParseArgs --> |无参数| LaunchFull[启动完整应用]
ShowHelp --> Exit([退出])
RunBackend --> Exit
RunTUI --> Exit
ModelConfig --> SaveConfig[保存配置]
SaveConfig --> Exit
LaunchFull --> SetupEnv[设置环境]
SetupEnv --> ConnectBackend[连接后端]
ConnectBackend --> StartTUI[启动 TUI]
StartTUI --> Exit
Exit --> End([结束])
```

**图表来源**
- [hackbot/cli.py:34-95](file://hackbot/cli.py#L34-L95)
- [main.py:44-52](file://main.py#L44-L52)

**章节来源**
- [hackbot/cli.py:1-100](file://hackbot/cli.py#L1-L100)
- [main.py:1-62](file://main.py#L1-L62)

### LLM HTTP 回退机制

v1.0.1 版本新增了 LLM HTTP 回退机制，提高了系统在不同 LLM 提供商下的稳定性：

```mermaid
sequenceDiagram
participant Agent as "智能体"
participant Provider as "LLM 提供商"
participant Fallback as "HTTP 回退"
participant Config as "配置管理"
Agent->>Provider : LLM 调用
Provider-->>Agent : 调用成功
Agent->>Provider : LLM 调用
Provider-->>Agent : 调用失败
Agent->>Config : 获取提供商配置
Config-->>Agent : 返回配置信息
Agent->>Fallback : HTTP 直接请求
Fallback-->>Agent : 返回处理后的结果
Agent->>Agent : 统一结果格式
Agent-->>Caller : 返回最终结果
```

**图表来源**
- [utils/llm_http_fallback.py:22-82](file://utils/llm_http_fallback.py#L22-L82)

**章节来源**
- [docs/RELEASE_v1.0.1.md:33-37](file://docs/RELEASE_v1.0.1.md#L33-L37)
- [utils/llm_http_fallback.py:1-108](file://utils/llm_http_fallback.py#L1-L108)

## 依赖分析

### Python 依赖关系

Secbot v1.0.1 的 Python 依赖关系体现了其模块化设计：

```mermaid
graph TB
subgraph "核心依赖"
LangChain[langchain>=0.1.0]
FastAPI[fastapi>=0.109.0]
Uvicorn[uvicorn[standard]>=0.27.0]
SSE[sse-starlette>=1.8.0]
LangGraph[langgraph>=0.2.0]
end
subgraph "工具依赖"
Requests[requests>=2.31.0]
SQLAlchemy[sqlalchemy>=2.0.25]
Pydantic[pydantic>=2.5.3]
Rich[rich>=13.7.0]
Typer[typer>=0.9.0]
end
subgraph "安全依赖"
Paramiko[paramiko>=3.0.0]
Selenium[selenium>=4.17.0]
Playwright[playwright>=1.41.0]
end
subgraph "开发依赖"
PyTest[pytest>=8.0.0]
Black[black>=23.0.0]
Flake8[flake8>=6.0.0]
MyPy[mypy>=1.0.0]
end
LangChain --> FastAPI
FastAPI --> SSE
LangGraph --> LangChain
Requests --> SQLAlchemy
Paramiko --> Security
```

**图表来源**
- [pyproject.toml:29-69](file://pyproject.toml#L29-L69)

### TypeScript 依赖关系

终端 TUI 的 TypeScript 依赖关系相对简洁：

```mermaid
graph LR
subgraph "核心依赖"
Ink[ink^4.4.1]
React[react^18.2.0]
InkMarkdown[ink-markdown^1.0.4]
InkTextInput[ink-text-input^5.0.1]
end
subgraph "开发依赖"
TypesNode[@types/node^20.10.0]
TypesReact[@types/react^18.2.0]
TSX[tsx^4.7.0]
TypeScript[typescript^5.3.0]
end
Ink --> React
InkMarkdown --> Ink
InkTextInput --> Ink
```

**图表来源**
- [terminal-ui/package.json:17-30](file://terminal-ui/package.json#L17-L30)

**章节来源**
- [pyproject.toml:1-184](file://pyproject.toml#L1-L184)
- [terminal-ui/package.json:1-35](file://terminal-ui/package.json#L1-L35)

## 性能考虑

### 并行执行优化

v1.0.1 版本在任务执行层面实现了更高效的并行处理：

- **分层执行**：根据任务依赖关系进行拓扑分层，确保依赖满足后再执行
- **并发控制**：每层最多 3 个并行任务，避免资源竞争
- **异步处理**：使用 asyncio.gather 实现真正的并行执行
- **状态追踪**：实时更新任务状态，支持断点续传

### 内存管理

- **向量存储**：使用 sqlite-vec 和 sqlite-vss 进行高效向量检索
- **会话缓存**：智能体状态和历史消息的内存缓存
- **数据库连接池**：优化 SQLite 连接管理

### 网络优化

- **HTTP 回退**：在主要 LLM 调用失败时自动降级到 HTTP 直连
- **CORS 配置**：开发环境允许跨域访问，生产环境严格限制
- **SSE 事件流**：高效的实时通信机制

## 故障排除指南

### 常见问题诊断

#### LLM 配置问题

**症状**：智能体无法正常响应或报错

**解决方案**：
1. 检查 `.env` 文件中的 API Key 配置
2. 使用 `hackbot model` 命令重新配置提供商
3. 验证网络连接和防火墙设置

#### 端口冲突

**症状**：后端服务启动失败

**解决方案**：
1. 检查端口 8000 是否被占用
2. 使用 `netstat -ano | findstr :8000` 查找占用进程
3. 结束占用进程或修改端口配置

#### TUI 启动问题

**症状**：终端 TUI 无法正常显示

**解决方案**：
1. 确保 Node.js 版本 >= 18
2. 检查终端兼容性
3. 重新安装依赖包

**章节来源**
- [router/main.py:83-97](file://router/main.py#L83-L97)
- [hackbot/cli.py:14-31](file://hackbot/cli.py#L14-L31)

### 日志分析

v1.0.1 版本增强了错误处理和日志记录：

```mermaid
flowchart TD
Error[发生异常] --> LogError[记录错误日志]
LogError --> WriteFile[写入 hackbot_error.log]
WriteFile --> ShowError[显示错误信息]
ShowError --> PauseCheck{检查打包状态}
PauseCheck --> |是| PauseConsole[暂停控制台]
PauseCheck --> |否| ExitProcess[退出进程]
PauseConsole --> WaitUser[等待用户输入]
WaitUser --> ExitProcess
```

**图表来源**
- [main.py:19-32](file://main.py#L19-L32)
- [hackbot/cli.py:14-31](file://hackbot/cli.py#L14-L31)

## 结论

Secbot v1.0.1 是一个功能强大且稳定的 AI 驱动安全测试平台。该版本在智能体协作、终端 TUI 体验、LLM 多提供商支持等方面都有显著改进，为用户提供了一个更加可靠和易用的安全测试工具。

**主要改进**：
- 智能体协作稳定性提升
- 终端 TUI 用户体验优化
- LLM 多提供商支持增强
- HTTP 回退机制提高系统可用性
- 文档和配置管理完善

**适用场景**：
- 授权的安全测试
- 系统安全评估
- 漏洞发现和验证
- 安全报告生成

## 附录

### 安装和配置

#### 从源码安装

```bash
git clone https://github.com/iammm0/secbot.git
cd secbot
git checkout v1.0.1
uv sync
```

#### 配置环境变量

创建 `.env` 文件并配置必要的 API Key：

```bash
DEEPSEEK_API_KEY=sk-your-api-key-here
OLLAMA_MODEL=gemma3:1b
OLLAMA_EMBEDDING_MODEL=nomic-embed-text
```

### 快速开始

#### 启动完整应用

```bash
# 方法1：使用 uv
uv run hackbot

# 方法2：直接运行
python main.py
```

#### 启动后端服务

```bash
# 方法1：使用 uv
uv run hackbot-server

# 方法2：直接运行
python -m router.main
```

#### 启动终端 TUI

```bash
cd terminal-ui
npm install
npm run tui
```

**章节来源**
- [README.md:182-291](file://README.md#L182-L291)
- [docs/RELEASE_v1.0.1.md:50-83](file://docs/RELEASE_v1.0.1.md#L50-L83)