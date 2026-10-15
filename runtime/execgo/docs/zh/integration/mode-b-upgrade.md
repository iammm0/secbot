# 模式 B 升级路径（translate + TaskGraph）

模式 B 面向需要 **直接操作 TaskGraph** 或先 **只翻译、不执行** 再上线的团队，与模式 A 可并存。

## 路径 1：仅 `translate`

`POST /adapters/translate`（或 `execgocli translate`）得到 `task_graph` 与 `translation_trace`，不进入调度器。

```bash
./execgocli translate -file request.json
```

## 路径 2：`POST /tasks` 直提

校审后使用 `POST /tasks` 或 `execgocli submit` 直接提交 `TaskGraph`。

```bash
./execgocli submit -file taskgraph.json
```

须符合 [Task DSL](../reference/task-dsl.md) 校验。

## 路径 3：在模式 A 中 `task_graph.submit`

仍用 adapter 统一信封，但 action kind 为 `task_graph.submit`，由你提供完整子图（控制与审计策略仍经 adapter 层）。

## 兼容性

- `POST /tasks` 为长期保留的低层入口。
- `adapter.v1` 见 [execgocli 契约](../reference/execgo-cli-contract.md)。

## 未来（可选）

- 可能增加批量 `POST /adapters/actions:batch` 降低往返，非当前采纳前置条件。

## 参见

- [模式 A 快速开始](mode-a-cli.md)
- [成熟 Agent 接入](agent-adapter.md)
