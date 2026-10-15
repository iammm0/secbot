# Agent-First 执行内核路线图

本文用于明确 ExecGo 的中长期定位，避免项目在演进中滑向“泛工作流引擎”。

## 一句话定位

**ExecGo 是一个面向 AI Agent 的执行内核 / action harness。**

它的职责不是替代上层 planner、memory、prompt orchestration，而是把上层 agent 的动作决策，可靠、安全、可观测地落到真实工具与运行环境中。

## 我们要做什么

ExecGo 应该重点强化以下能力：

- 统一任务执行状态机
- 统一异步句柄、轮询、取消、恢复语义
- 统一结果结构与错误结构
- 执行器权限控制与策略治理
- 任务执行事件流与审计能力
- 面向 agent 的工具运行时，而不只是通用函数调用器

## 我们不做什么

ExecGo 不应主动扩展成下面这些系统：

- 重型 planner
- prompt 编排平台
- 通用 memory framework
- 多智能体产品层
- 过于复杂的工作流 DSL
- 泛化到失去 agent 场景差异化的“另一个 DAG 引擎”

上层系统可以负责“想做什么”，ExecGo 负责“怎么安全可靠地执行”。

## 当前基础

目前仓库已经具备这些基础：

- DAG 调度
- 并发执行
- retry / timeout
- 状态持久化与恢复
- HTTP API
- 可选 gRPC 接入
- V2 执行器模型：`category + tool`
- 已有 `os / mcp / cli-skills` 三类执行器
- 可观测性基础：日志、trace、metrics

这意味着项目已经具备 agent harness 的雏形，不需要回退到纯通用执行引擎路线。

## 设计原则

### 1. Agent-first

优先满足 AI agent 的真实工作负载：

- 工具调用
- 长任务运行
- 轮询与恢复
- 环境访问控制
- 结构化结果消费
- 人工介入点

### 2. Core stays small

核心模块保持克制：

- 优先使用标准库
- 可选能力放入 `contrib/*`
- 不把所有上层编排逻辑塞进内核

### 3. Runtime over wrappers

目标不是做一组零散工具封装，而是做一个真正的执行运行时：

- 有统一状态机
- 有统一生命周期
- 有统一错误模型
- 有统一审计与观测

### 4. Safe by default

对 `shell`、`file`、`http`、`tcp` 等执行器，默认考虑：

- 路径边界
- 网络边界
- 超时边界
- 输出大小边界
- 审计记录

### 5. Explicit over magic

尽量避免过度隐式的数据流和神秘模板系统：

- 输入来源显式
- 结果引用显式
- 错误语义显式
- 权限策略显式

## 分阶段路线图

## P0: 从“可执行”升级到“可作为 agent runtime 使用”

目标：统一执行层的核心语义。

重点事项：

- 统一任务运行状态
  建议至少支持：`accepted`、`running`、`success`、`failed`、`cancelled`
- 统一 `handle_id / run_status / progress`
  不只服务于 `mcp`，而是成为跨执行器的一致能力
- 统一结果结构
  提供公共字段，例如：
  - `status`
  - `output`
  - `started_at`
  - `finished_at`
  - `duration_ms`
  - `attempt`
- 统一错误结构
  至少区分：
  - `retryable`
  - `timeout`
  - `denied`
  - `invalid_input`
  - `external_failure`
- 增加取消能力
  允许对支持句柄的任务执行 cancel
- 为危险执行器增加策略控制第一版
  优先覆盖：
  - `shell`
  - `file`
  - `http`
  - `tcp`

建议落点：

- `pkg/models`
- `pkg/executor`
- `pkg/httpserver`
- `pkg/scheduler`
- `pkg/config`

## P1: 把运行时做厚

目标：让 ExecGo 更像真正的 harness，而不是任务调用集合。

重点事项：

- 引入 `process` 执行器
  支持长任务、后台进程、日志读取、终止
- 引入 `git` 执行器
  面向 agent 编码场景，提供比裸 shell 更稳定、更可控的 git 能力
- 任务事件流
  建议事件类型：
  - `task_submitted`
  - `task_started`
  - `task_progressed`
  - `task_retried`
  - `task_succeeded`
  - `task_failed`
  - `task_cancelled`
- 审计日志
  记录谁发起、执行了什么、是否命中策略、结果如何
- 持久化句柄和进度
  重启后不只恢复任务状态，也恢复运行时语义

建议落点：

- `pkg/executor/process.go`
- `pkg/executor/git.go`
- `pkg/observability`
- `pkg/store`
- `pkg/store/jsonfile`

## P2: 强化 agent 场景差异化

目标：让 ExecGo 成为真正的 agent action harness。

重点事项：

- Human-in-the-loop
  支持：
  - pause
  - resume
  - approve
  - reject
- remote MCP
  支持连接远程工具生态，而不局限于本地 stub
- browser / computer-use bridge
  为需要操作软件环境的 agent 提供桥接层
- 更强的隔离能力
  例如工作目录约束、进程隔离、网络隔离、资源限制

## 执行器扩展优先级

优先做：

- `process`
- `git`
- 更强的 `mcp`
- 策略层

谨慎推进：

- `db`
- `archive`
- `template/json transform`

后置考虑：

- browser / computer-use
- container isolation
- remote plugin discovery

## 成功标准

如果路线正确，后续应该能逐步达到以下状态：

- 上层 agent 可以把动作稳定投递给 ExecGo
- 工具调用有统一状态与结构化结果
- 执行风险可以被限制和审计
- 长任务可以轮询、取消、恢复
- 任务失败语义更适合 agent 自动决策
- 代码库始终保持“agent runtime 内核”边界，而不是膨胀成全栈 agent framework

## 推荐的下一步

优先进入 P0，不要先扩很多零散执行器。

更具体地说，下一批最值得做的事情是：

1. 统一执行状态机
2. 统一结果结构
3. 统一错误结构
4. 增加取消能力
5. 给危险执行器加第一版策略控制

这五项完成后，ExecGo 才真正具备清晰的 agent-first 内核形态。
