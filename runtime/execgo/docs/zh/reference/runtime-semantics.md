# 执行运行时语义

本文定义 ExecGo 执行层的统一运行时语义，用于指导后续调度器、执行器、HTTP/gRPC API 和持久化结构的演进。

这份文档的目标不是一次性推翻现有实现，而是先把未来应收敛到的 runtime 契约固定下来。

## 设计目标

ExecGo 的执行层应当被视为一个面向 AI Agent 的 action harness，而不是一组零散工具调用的拼装。

因此，运行时语义需要满足：

- 对上层 agent 来说状态可判定
- 对长任务来说句柄可轮询
- 对失败来说错误可机器处理
- 对运维和调试来说事件可追踪
- 对未来权限控制和人工介入来说语义可扩展

## 一、统一状态机

### 1. 调度状态与运行状态分层

建议继续保留两层语义：

- `Task.Status`
  面向工作流调度层，表达该任务在 DAG 中的总体状态
- `RuntimeResult.Status`
  面向执行运行时，表达一次实际 task run 的生命周期状态

这样可以避免把“DAG 语义”和“执行语义”混成一层。

### 2. 调度状态

当前调度状态可继续沿用：

- `pending`
- `running`
- `success`
- `failed`
- `skipped`

含义：

- `pending`
  已提交，等待依赖满足和调度
- `running`
  已进入执行阶段
- `success`
  最终执行成功
- `failed`
  最终执行失败
- `skipped`
  因依赖失败或取消而未执行

### 3. 运行时状态

建议统一为：

- `accepted`
- `running`
- `success`
- `failed`
- `cancelled`

含义：

- `accepted`
  任务已被执行器接收，但尚未进入明确运行态
  适用于异步执行器、远程执行器、队列型执行器
- `running`
  正在执行
- `success`
  执行完成且成功
- `failed`
  执行完成但失败
- `cancelled`
  执行被显式取消，或被运行时中止并确认取消成功

### 4. 状态转移规则

建议允许的主路径如下：

```text
submitted -> pending -> running -> success
submitted -> pending -> running -> failed
submitted -> pending -> skipped
submitted -> pending -> running -> cancelled

runtime:
accepted -> running -> success
accepted -> running -> failed
accepted -> running -> cancelled
accepted -> failed
```

约束：

- `success`、`failed`、`cancelled`、`skipped` 都是终态
- `skipped` 只属于调度层，不属于一次真实执行
- `cancelled` 不应再回到 `running`
- `accepted` 主要用于异步执行器，不要求同步执行器必须暴露停留在该状态

## 二、句柄语义

### 1. 为什么需要 handle

只要执行器支持以下任一场景，就应该支持句柄：

- 长任务
- 远程任务
- 需要轮询状态
- 需要取消
- 需要持续获取 progress

### 2. 统一字段

建议统一使用：

- `handle_id`
- `status`
- `progress`
- `started_at`
- `finished_at`

### 3. 行为约定

- 同步执行器可以不返回 `handle_id`
- 异步执行器必须返回稳定的 `handle_id`
- `handle_id` 应足以查询一次 run 的当前状态
- 后续 `cancel`、`poll`、`resume` 等能力都应以 `handle_id` 为核心锚点

## 三、统一结果结构

建议标准结果包络如下：

```json
{
  "status": "success",
  "handle_id": "run-123",
  "output": {},
  "started_at": "2026-03-30T12:00:00Z",
  "finished_at": "2026-03-30T12:00:03Z",
  "duration_ms": 3000,
  "attempt": 1,
  "details": {},
  "error": null
}
```

字段建议：

- `status`
  运行时状态
- `handle_id`
  任务句柄；同步执行器可省略
- `output`
  执行器主输出，供上层 agent 消费
- `started_at`
  实际开始执行时间
- `finished_at`
  实际结束时间；未结束时为空
- `duration_ms`
  总执行时长
- `attempt`
  当前成功或失败对应的尝试次数
- `details`
  执行器私有补充信息，例如：
  - shell 的 `exit_code/stdout/stderr`
  - http 的 `status_code/headers`
  - file 的 `path/size`
- `error`
  结构化错误；成功时为空

### 输出约束

建议把输出分成两层：

- `output`
  上层最关心的标准业务结果
- `details`
  调试和执行器专属细节

这能降低上层 agent 对执行器细节的耦合。

## 四、统一错误结构

建议标准错误包络如下：

```json
{
  "code": "timeout",
  "message": "task exceeded timeout 5000ms",
  "retryable": true,
  "source": "scheduler",
  "details": {
    "timeout_ms": 5000
  }
}
```

### 建议错误码

- `unknown`
- `invalid_input`
- `timeout`
- `cancelled`
- `denied`
- `not_found`
- `external_failure`
- `internal`

### 字段含义

- `code`
  机器可判定的稳定错误分类
- `message`
  人类可读的错误描述
- `retryable`
  是否建议继续重试
- `source`
  错误来源，例如：
  - `scheduler`
  - `executor`
  - `policy`
  - `store`
- `details`
  附加上下文

### 错误语义建议

- `invalid_input`
  通常不可重试
- `timeout`
  视执行器类型，一般可配置为可重试
- `denied`
  默认不可重试
- `external_failure`
  可由执行器决定是否可重试
- `internal`
  默认可视情况重试，但应重点报警

## 五、事件流语义

建议引入统一事件模型，为后续日志、审计、Web UI 和流式订阅做准备。

建议事件类型：

- `task_submitted`
- `task_accepted`
- `task_started`
- `task_progressed`
- `task_retried`
- `task_succeeded`
- `task_failed`
- `task_cancelled`

事件至少包含：

- `type`
- `task_id`
- `handle_id`
- `timestamp`
- `message`
- `data`

## 五点五、与 execgo-runtime 的映射约定（推荐实现）

`execgo-runtime` 是 ExecGo 生态的数据面运行时，负责异步提交、调度、执行与持久化，并对外提供 HTTP API。

为实现“可轮询/可取消/可追踪”的统一语义，推荐使用以下映射：

### 1) 关键端点映射

- 提交：`POST /api/v1/tasks`
- 轮询：`GET /api/v1/tasks/{ref}`
- 取消：`POST /api/v1/tasks/{ref}/kill`
- 事件：`GET /api/v1/tasks/{ref}/events`
- 能力/资源探测（可选）：
  - `GET /api/v1/runtime/info`
  - `GET /api/v1/runtime/capabilities`
  - `GET /api/v1/runtime/resources`
  - `GET /api/v1/runtime/config`

其中 `{ref}` 的取值见下一节的句柄兼容策略。

### 2) handle_id / task_id 兼容策略

不同 runtime 可能会：

- 用 `task_id` 作为查询/取消/事件的路径参数
- 或用 `handle_id` 作为路径参数（`task_id` 仅做业务 ID）

为兼容两种实现，推荐策略：

- **ExecGo 内部一律用 `handle_id` 作为异步锚点**（用于调度器轮询与未来取消）；
- 若 runtime 返回的 `handle_id != task_id`，ExecGo 侧应记住两者映射；
- 当使用 `handle_id` 调用查询/取消/事件返回 `404` 时，自动 fallback 到 `task_id` 再试一次。

### 3) 事件结构

推荐 `GET /api/v1/tasks/{ref}/events` 返回数组：

```json
[
  {
    "type": "task_started",
    "task_id": "task-1",
    "handle_id": "handle-1",
    "timestamp": "2026-04-21T00:00:00Z",
    "message": "started",
    "data": {}
  }
]
```

字段语义与本文的 `RuntimeEvent` 对齐。

### 4) 错误结构

推荐所有非 2xx 响应返回 `{ "error": { "code": "...", "message": "...", "details": ... } }`，
ExecGo 侧应将其归一化为 `RuntimeError`（包括 `retryable/source/details` 的补充）。

## 六、当前结构到目标结构的映射建议

当前已有字段：

- `Task.Status`
- `Task.RunStatus`
- `Task.HandleID`
- `Task.Progress`
- `Task.Result`
- `Task.Error`
- `executor.Result`

建议演进方式：

### 阶段 1：兼容式补强

- 保留现有 `Task.Status`
- 让 `Task.RunStatus` 明确只承载 runtime status
- 让 `Task.Result` 逐步收敛为标准 `RuntimeResult` 的 JSON 表示
- 让 `Task.Error` 作为兼容字段保留，同时逐步引入结构化错误

### 阶段 2：执行器统一返回结构化结果

- `executor.Result` 应逐步对齐到统一运行时结果模型
- 所有执行器都尽量返回一致的 `status/output/error/progress`

### 阶段 3：API 正式暴露统一契约

- `GET /tasks/{id}` 返回的任务对象中，运行时字段具备稳定含义
- 新增句柄查询或取消接口时，以统一结构输出

## 七、对未来功能的约束

这套语义是为以下能力预留空间：

- cancel
- pause / resume
- human-in-the-loop
- 远程 MCP
- process 类长任务
- browser / computer-use bridge
- 策略控制与审批

因此后续新增字段时，应优先复用统一结果、错误和事件模型，而不是为每个执行器单独发明一套状态表达。

## 八、建议的第一批落地项

在代码层，建议优先做下面几件事：

1. 把运行时状态枚举固定下来
2. 引入统一 `RuntimeResult`
3. 引入统一 `RuntimeError`
4. 让调度器在写回 `Task.Result` 时遵循统一包络
5. 为后续 `cancel` 预留句柄语义

在此基础上，ExecGo 的执行层才真正具备清晰的 agent runtime 语义。
