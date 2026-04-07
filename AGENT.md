# AGENT.md

这份文档面向以后进入本仓库工作的编码 agent。目标不是重复 `README.md`，而是让你在几分钟内建立一个**足够可靠的代码心智模型**，知道：

- 这个项目当前 `main` 分支的真实主链路是什么
- 哪些模块是核心，哪些模块是扩展或历史遗留
- 改一个能力时应该从哪里下手
- 哪些命名、事件、接口是不能随便改的

当 `README`、`docs/` 和实现出现差异时，**以当前代码为准**。这份文档就是根据当前 `main` 分支代码整理的。

---

## 1. 项目一句话概括

Secbot / Hackbot 是一个以 **Python FastAPI 后端** 为核心的 AI 自动化安全测试系统，后端负责：

- 请求路由与会话编排
- 规划任务（Planner）
- 通过 ReAct + 工具执行安全测试
- 将执行过程通过 SSE 返回给 CLI / API 客户端
- 用 SQLite 保存配置、对话、提示词链和审计数据

当前仓库主维护方向是 Python 端：`Typer + Rich` 交互与 FastAPI API。

---

## 2. 最重要的事实

### 2.1 当前默认主 Agent 不是单体 Hackbot，而是协调器

当前对外默认 agent key 是 `secbot-cli`，它在代码里对应的是：

- `core/agents/coordinator_agent.py` 中的 `CoordinatorAgent`

`CoordinatorAgent` 内部再协调：

- `NetworkReconAgent`
- `WebPentestAgent`
- `OSINTAgent`
- `TerminalOpsAgent`
- `DefenseMonitorAgent`
- 以及一个兜底 `HackbotAgent`

也就是说，当前 `main` 的真实架构已经从“单一 ReAct agent”演进到了“**规划 + 分层执行 + 多专职子 agent 协同**”。

### 2.2 `/api/chat` 是最核心的用户入口

主聊天入口是：

- `router/chat.py`

这里会：

- 为每次请求创建新的 `EventBus`
- 创建新的 `SessionManager`
- 将 `SessionManager` 产生的事件映射为 SSE
- 将 SSE 推给客户端

### 2.3 后端聊天接口当前是“无状态请求编排”，不是“持久会话服务”

这一点很容易误判。当前实现里：

- `router/chat.py` 每次请求都会新建 `SessionManager`
- `router/sessions.py` 明确说明后端当前是无状态的，并返回空 session 列表

所以：

- `SessionManager` 的内存 session 只在单次请求编排期间有意义
- 真正跨请求持久化的数据主要在 SQLite 中
- 对话持久化靠 `DatabaseMemory`
- 不是靠 `/api/sessions`

### 2.4 项目命名有历史混用，改名时一定谨慎

当前仓库同时存在这些名字：

- 项目包名：`secbot`
- UI/文案展示名：`Hackbot` / `SuperHackbot`
- 默认 agent key：`secbot-cli`
- CLI 命令：`hackbot` / `secbot` / `secbot-cli`

不要因为看到一个旧名字就全局替换。这里有明显的历史兼容需求。

---

## 3. 推荐阅读顺序

如果你刚接手一个需求，建议按这个顺序看代码：

1. `router/main.py`
2. `router/chat.py`
3. `core/session.py`
4. `core/agents/coordinator_agent.py`
5. `core/agents/specialist_agents.py`
6. `core/executor.py`
7. `core/patterns/security_react.py`
8. `core/agents/planner_agent.py`
9. `tools/pentest/security/__init__.py`
10. `router/dependencies.py`
11. `hackbot_config/__init__.py`
12. `database/manager.py`

如果你要改 CLI 输出或 SSE，再补看：

- `secbot_cli/runner.py`
- `router/chat.py`

---

## 4. 当前真实执行链路

这是当前 `main` 最重要的一条链路：

1. CLI 或外部客户端向 `POST /api/chat` 发请求
2. `router/chat.py` 创建 `EventBus` 和 `SessionManager`
3. `SessionManager.handle_message()` 决定走哪条路：
   - `ask` / 简单问答 -> `QAAgent`
   - 技术任务 -> `PlannerAgent` -> 执行 -> `SummaryAgent`
4. 规划结果是 `PlanResult + TodoItem[]`
5. 如果目标 agent 支持 `execute_todo()`，则进入 `TaskExecutor`
6. `TaskExecutor` 按依赖分层执行 todo，可层内并发
7. `CoordinatorAgent.execute_todo()` 根据 `agent_hint` / `resource` / `tool_hint` 把 todo 分发给专职子 agent
8. 专职子 agent 继承 `SecurityReActAgent`，执行：
   - LLM 提取参数
   - 调工具
   - 回传 `thought` / `action` / `content` / `result`
9. `SessionManager` 用 `SummaryAgent` 汇总结果
10. `router/chat.py` 把事件映射成 SSE 返回给客户端

可以把它记成：

`Client -> /api/chat -> SessionManager -> Planner -> TaskExecutor -> CoordinatorAgent -> SpecialistAgent -> Tool -> Summary -> SSE`

---

## 5. 核心模块地图

### 5.1 后端入口与装配

- `main.py`
  - 根目录一键入口
  - 默认启动交互 CLI
- `secbot_cli/cli.py`
  - 包安装后的 CLI 入口
  - `--backend` / `model` 子命令都在这里处理
- `router/main.py`
  - FastAPI app 工厂
  - 注册所有路由
  - 健康检查与请求日志

### 5.2 聊天主链路

- `router/chat.py`
  - `/api/chat` SSE 入口
  - 事件到 SSE 的映射函数 `_event_to_sse`
  - root 权限请求/回传
- `core/session.py`
  - 会话编排核心
  - 负责路由、规划、执行、摘要

### 5.3 Agent 体系

- `core/agents/router.py`
  - 用户输入分类：`qa` / `technical` / `other`
- `core/agents/qa_agent.py`
  - 轻量问答
  - `ask` 模式的主入口
- `core/agents/planner_agent.py`
  - 生成 `PlanResult` 和 `TodoItem`
- `core/agents/coordinator_agent.py`
  - 默认主 agent
  - 多专职子 agent 调度入口
- `core/agents/specialist_agents.py`
  - 各领域专职 agent
- `core/agents/hackbot_agent.py`
  - 自动执行的基础模式 agent
- `core/agents/superhackbot_agent.py`
  - 专家模式，敏感工具需确认
- `core/agents/summary_agent.py`
  - 最终报告与摘要

### 5.4 执行层

- `core/executor.py`
  - 基于依赖的分层执行器
  - 层内可并发
  - 但回放事件时保持客户端线性可读
- `core/patterns/security_react.py`
  - ReAct 核心骨架
  - 同时承担 `process()` 和 `execute_todo()` 两套执行入口

### 5.5 工具层

- `tools/base.py`
  - 工具抽象基类
- `tools/pentest/security/__init__.py`
  - 聚合核心/基础/高级工具
- `tools/registry.py`
  - 外部工具扩展注册中心
- `tools/*`
  - 各类工具按领域拆目录

### 5.6 配置、数据库、提示词、技能

- `hackbot_config/__init__.py`
  - 配置读取与保存
  - SQLite / 环境变量 / keyring 的融合点
- `database/manager.py`
  - SQLite 表结构与 CRUD
- `prompts/manager.py`
  - Prompt 模板与链管理
- `skills/loader.py`
  - Markdown 技能加载器

注意：**PromptManager 和 Skills 系统是现有能力，但不在当前 `/api/chat` 主链路的最核心位置**。如果你在修主流程问题，先看会话编排、执行器和 agent，不要一开始就把注意力放到 skills 上。

---

## 6. Agent 体系怎么理解

### 6.1 `SessionManager` 是编排器，不是大脑

`core/session.py` 的职责是：

- 接住请求
- 判断走 QA 还是技术链路
- 调 planner
- 调执行器或直接调 agent
- 做摘要
- 把事件桥接到 `EventBus`

它**不应该**成为塞满业务逻辑的大杂烩。如果你要新增能力，优先考虑：

- 放到 planner
- 放到 agent
- 放到 tool
- 放到事件映射层

而不是先改 `SessionManager`。

### 6.2 `PlannerAgent` 现在的输出很关键

`PlannerAgent` 输出的是结构化的 `PlanResult`：

- `plan_summary`
- `todos`
- 每个 todo 可带：
  - `tool_hint`
  - `depends_on`
  - `resource`
  - `risk_level`
  - `agent_hint`

这些字段后面都会被消费：

- `TaskExecutor` 用依赖、风险和资源做调度
- `CoordinatorAgent` 用 `agent_hint/resource/tool_hint` 做子 agent 路由
- `SummaryAgent` 用 todo 完成情况做汇总

所以一旦你改了 todo 字段含义，影响的是整条链。

### 6.3 `TaskExecutor` 是当前主执行器

它做了几件很重要的事：

- 读取 planner 的执行层级
- 单 todo 层串行执行
- 多 todo 层 `asyncio.gather()` 并发执行
- 并发执行结束后按计划顺序回放事件

这意味着：

- 它既追求吞吐，也在照顾客户端可读性
- 客户端看到的是“线性的完整过程”
- 但后端实际上可以并发工作

### 6.4 `CoordinatorAgent` 是多子 agent 分发中心

`CoordinatorAgent.execute_todo()` 是当前默认 agent 的真正执行入口。

它会按照这个优先级选子 agent：

1. `Todo.agent_hint`
2. `Todo.resource` 前缀
3. `Todo.tool_hint` 关键词兜底
4. 都匹配不到再回退到内部默认 `HackbotAgent`

如果你新增一个新的专职 agent，通常至少要改这些地方：

- `core/agents/specialist_agents.py`
- `core/agents/coordinator_agent.py`
- `PlannerAgent` 生成 `agent_hint` 的逻辑

### 6.5 `SecurityReActAgent` 是真正的执行骨架

这个类最重要，因为：

- `process()` 负责完整 ReAct 循环
- `execute_todo()` 负责单个 todo 的 LLM 参数提取 + 工具执行
- `_call_llm_stream()` 负责 thought chunk 流式输出
- `_emit_event()` 负责把内部事件转成 `EventBus` 事件

特别要记住：

- 当前分层执行模式主要走 `execute_todo()`
- `execute_todo()` 会根据 `todo.content + tool schema + context` 让 LLM 生成参数
- 也就是说，todo 的文案质量会直接影响工具参数提取质量

---

## 7. 工具系统怎么扩展

### 7.1 内置工具组织方式

当前工具大致分为这些组：

- `CORE_SECURITY_TOOLS`
- `NETWORK_TOOLS`
- `DEFENSE_TOOLS`
- `UTILITY_TOOLS`
- `WEB_TOOLS`
- `OSINT_TOOLS`
- `PROTOCOL_TOOLS`
- `REPORTING_TOOLS`
- `CLOUD_TOOLS`
- `WEB_RESEARCH_TOOLS`
- `ADVANCED_SECURITY_TOOLS`

默认 agent 可用的基础工具最终聚合在：

- `tools/pentest/security/__init__.py`

### 7.2 外部扩展方式

`tools/registry.py` 支持两种注册外部工具：

- setuptools entry point
- 环境变量指定模块

因此你加第三方工具时，不一定必须改内置聚合文件。

### 7.3 新增内置工具的推荐步骤

如果你要新增一个仓库内置工具，通常按这个顺序：

1. 在合适的 `tools/...` 目录下实现工具类
2. 在该目录的 `__init__.py` 导出工具列表
3. 把工具接到 `tools/pentest/security/__init__.py` 的聚合链中
4. 如果希望 `/api/tools` 里可见，更新 `router/tools.py`
5. 如果 planner 需要更精准命中，给 planner 示例或 tool_hint 规则补充上下文
6. 为对应目录补测试

### 7.4 一个容易忽略的点

`PlannerAgent` 在规划前会尝试从 agent 的 `tools_dict` 里拿工具名，作为 planning 上下文。

这就是 `CoordinatorAgent.tools_dict` 为什么存在的原因：

- 如果 agent 不暴露 `tools_dict`
- planner 就容易输出 `tool_hint: null`
- 后续 todo 就会失去可执行性

---

## 8. SSE / 客户端契约

这部分是全仓库最容易被“后端改了、客户端消费逻辑忘了同步”搞坏的地方。

### 8.1 事件来源

内部事件来源链路：

- `SecurityReActAgent._emit_event()`
- `SessionManager._bridge_agent_event()`
- `EventBus`
- `router/chat._event_to_sse()`
- CLI / 外部 SSE 客户端

### 8.2 当前客户端关注的主要 SSE 事件

当前客户端普遍依赖这些事件名：

- `connected`
- `planning`
- `thought_start`
- `thought_chunk`
- `thought`
- `action_start`
- `action_result`
- `content`
- `report`
- `phase`
- `response`
- `done`
- `error`
- `root_required`

### 8.3 改事件时必须联动的文件

如果你修改事件名、payload 字段或渲染语义，至少检查这些地方：

- `router/chat.py`
- `secbot_cli/runner.py`

很多输出逻辑是“镜像后端事件”的，而不是靠统一 schema 自动推导。

### 8.4 `view_type` 也是契约的一部分

当前 `action_result` / `content` / `report` 等事件里，后端会附带 `view_type`，如：

- `raw`
- `summary`

CLI 渲染与外部客户端通常会依赖这个字段，所以不要随手删。

---

## 9. 配置与数据持久化

### 9.1 配置优先级

当前 LLM 与用户配置主要来自：

1. SQLite `user_configs`
2. 环境变量
3. 默认值

配置入口在：

- `hackbot_config/__init__.py`

### 9.2 数据库路径

数据库路径来自：

- `DATABASE_URL`

默认会落到：

- `data/secbot.db`

相关逻辑分别在：

- `hackbot_config/__init__.py`
- `database/manager.py`

### 9.3 SQLite 当前承担的职责

SQLite 当前主要存：

- 对话记录 `conversations`
- 提示词链 `prompt_chains`
- 用户配置 `user_configs`
- 爬虫任务 `crawler_tasks`
- 攻击任务 `attack_tasks`
- 扫描结果 `scan_results`
- 审计轨迹 `audit_trail`

### 9.4 单例与持久记忆

`router/dependencies.py` 会懒加载单例：

- `DatabaseManager`
- `PlannerAgent`
- `QAAgent`
- `SummaryAgent`
- `CoordinatorAgent`
- `SuperHackbotAgent`

同时会给 agent 挂上 `DatabaseMemory`。

所以当前的“跨请求记忆感”主要来自：

- 单例 agent
- SQLite 对话持久化

不是来自 `SessionManager` 的内存 session。

---

## 10. 客户端定位

### 10.1 `secbot_cli/runner.py`

这是当前最贴近后端事件模型的客户端渲染入口，适合调试主链路。

特点：

- Typer + Rich
- 进程内 EventBus 实时输出
- 支持规划/推理/执行/观察/总结分块渲染
- 支持 `/model` 与 root 交互

如果你在调 SSE 事件或 agent 流程，**优先用这个入口验证**。

---

## 11. 常见修改应该从哪里入手

### 11.1 想新增一种扫描/分析能力

优先路径：

1. 新增或扩展工具
2. 确保工具被聚合进正确的工具组
3. 让 planner 能规划出这个工具
4. 如有必要补 `agent_hint`
5. 补测试

不要第一反应去 `SessionManager` 里写 if/else。

### 11.2 想让某类任务走不同子 agent

优先检查：

- `PlannerAgent` 是否给了合适的 `agent_hint`
- `CoordinatorAgent._select_sub_agent()` 是否能命中
- `resource` 前缀是否合理

### 11.3 想改“规划 -> 执行”链路

必须联动检查：

- `core/models.py`
- `core/agents/planner_agent.py`
- `core/executor.py`
- `core/session.py`
- `core/agents/summary_agent.py`

因为 todo 结构一变，这几个点都可能受影响。

### 11.4 想改问答模式

先看：

- `core/agents/router.py`
- `core/agents/qa_agent.py`
- `router/chat.py`

`ask` 模式当前是一个相对独立的分支，不要误把它和 agent 执行链混在一起。

### 11.5 想改模型配置、API Key、Base URL

先看：

- `hackbot_config/__init__.py`
- `utils/model_selector.py`
- `secbot_cli/runner.py`（`/model` 交互入口）

### 11.6 想改权限提升 / root 交互

先看：

- `router/chat.py` 中的 `root_required` / `/root-response`
- `utils/root_policy.py`
- `secbot_cli/runner.py` 中的 root 交互逻辑

---

## 12. 哪些文档值得参考，哪些不要过度依赖

### 可以参考

- `README.md`
- `docs/API.md`
- `docs/design-paradigms/*.md`

### 但要记住

这些文档里有一部分内容更像：

- 架构意图
- 设计范式总结
- 某阶段的说明快照

不一定 100% 等于当前实现。

尤其这些点要以代码为准：

- 默认 agent 到底是谁
- session 是否持久化
- 当前 SSE 事件名和 payload
- planner / executor 的真实字段

---

## 13. 开发命令速查

### Python 依赖

```bash
uv sync
```

### 启动后端

```bash
uv run python -m router.main
```

或：

```bash
uv run secbot-cli-server
```

### 一键启动交互 CLI

```bash
python main.py
```

### 跑测试

```bash
uv run pytest tests/ -v
```

也可以按子目录定点跑：

```bash
uv run pytest tests/router -v
uv run pytest tests/core -v
uv run pytest tests/tools -v
```

注意仓库里有一些 `disabled_test_*.py`，它们默认不会被 pytest 发现。

---

## 14. 给未来 coding agent 的几条建议

- 改 SSE 前，先全仓库搜索事件名，不要只改后端。
- 改 agent 命名、UI 文案或 API 参数时，先搜索 `Hackbot`、`Secbot`、`secbot-cli`、`superhackbot` 四组关键词。
- 看到 `docs/design-paradigms` 时，把它们当“设计参考”，不是“运行时真相”。
- 真正影响主链路的代码集中在 `router/chat.py`、`core/session.py`、`core/executor.py`、`core/agents/*`、`core/patterns/security_react.py`。
- 如果一个需求本质上是“新增能力”，优先扩展 tool 或 specialist agent，而不是继续加大 `SessionManager` 的复杂度。
- 如果一个需求本质上是“提高 planner 命中率”，重点优化 todo 文案、`tool_hint`、`agent_hint` 和可用工具上下文。

---

## 15. 一句话总结

把当前项目理解成：

**一个以 FastAPI 为壳、以 SessionManager 为编排器、以 Planner + TaskExecutor + CoordinatorAgent 为主执行链、以 SecurityReActAgent 为底层执行骨架、以 Typer+Rich CLI 与 API 为外部表现层的安全测试系统。**

只要抓住这条主线，后续无论改 agent、工具、UI，都会容易很多。
