# 轮询与幂等：稳定提交与读取结果

ExecGo 的执行是异步的：提交后不会立刻得到最终结果。因此上层编排层通常需要实现“提交 -> 轮询 -> 读取结果/失败原因”的闭环，并尽量做到幂等/可恢复。

## 1. 提交后的异步行为

上层通过 `POST /tasks` 提交一个 `TaskGraph` 后：

- 接口立即返回 `202 Accepted` 和 `task_ids`
- 调度器后台开始执行（按依赖关系并发执行）
- 你必须通过 `GET /tasks/{id}` 轮询每个任务，直到出现最终状态：
  - `success`：成功完成，`result` 可读
  - `failed`：最终失败，`error` 可读
  - `cancelled`：任务被主动取消
  - `skipped`：通常表示上游依赖失败或取消导致未执行

## 2. 上层“幂等”要点：task.id 决定是否会被覆盖

ExecGo 内部状态存储在 `store.Store`（默认是 `pkg/store/jsonfile`）。默认实现中：

- `Put(task)` 是“存储或更新”：如果 `task.ID` 已存在，会被新的 task 覆盖
- 这意味着：如果你因为网络超时等原因再次 `POST /tasks`，并且复用了相同 `task.id`，那么这些任务可能会被重新置为执行状态并再次跑起来

因此，幂等策略通常是二选一：

- 方案 A：复用 task.id（用于“同一 workflow run 的重复请求安全”）
  - 你需要先用 `GET /tasks/{id}` 判断任务是否已经存在并处于你可接受的状态
  - 如果已在 `success/failed/cancelled/skipped`，直接读取结果；不要重复提交
  - 如果已存在但仍是 `pending/running/cancelling`，不要重复提交，继续轮询到结束
- 方案 B：为每次“重新执行”生成新 task.id（用于“允许重复跑，但区分执行轮次”）
  - 常见做法是把 workflowRunId/attemptId 也拼到 `task.id` 中

## 3. 推荐轮询算法（每个 task 一条轮询）

一个简单且可靠的轮询流程：

1. 提交 `POST /tasks`，拿到 `task_ids`
2. 对每个 `task_id`：
   - 以指数退避轮询 `GET /tasks/{id}`
   - 当状态为 `success/failed/cancelled/skipped` 时停止轮询
3. 结合你的业务 DAG 逻辑做后续决策

退避建议（仅示例，可按业务调参）：

- 初始间隔：`500ms`
- 最大间隔：`5s`
- 每次乘以 1.5~2，直到达到最大间隔

## 4. 删除（DELETE）与运行中任务的关系

ExecGo 的 `DELETE /tasks/{id}` 只影响状态存储中的记录，并不等价于“取消正在执行的任务”。

对上层来说，这意味着：

- 你可以把 DELETE 当作“清理状态/回收资源”的工具
- 但不要把它当作“取消执行”的强保证

真正的执行控制请使用 `POST /tasks/{id}/cancel`。控制面状态流转为：

```text
running -> cancelling -> cancelled
```

对于 runtime 类型任务，ExecGo 会调用 executor 的 handle cancel 路径，并映射到 `execgo-runtime` 的 `POST /api/v1/tasks/{ref}/kill`。对于本地可取消 executor，scheduler 会取消任务 context。

## 5. 动态 params：当下游依赖上游产物时怎么做？

因为 ExecGo 不做“自动把上游 result 注入到下游 params”的变量替换，你需要：

- 先提交上游并轮询拿到 `result/error`
- 然后二次提交下游，并在编排层把上游产物手动注入到下游 `params`

这会把你的整体流程变成“多次提交（分阶段）”，而不是一次性提交动态 DAG。
