# 映射：DAG -> TaskGraph

本页说明当你是“上层编排层”时，如何把自己的工作流节点/边映射成 ExecGo 运行时期望的 `TaskGraph`。

> 关键结论：ExecGo 不关心你的工作流内部模型，只关心提交的 `TaskGraph` 是否满足校验规则、以及每个 `Task` 的 `type`/`params` 是否能被对应执行器解析。

## 1. 工作流节点（node）-> `Task`

对工作流中的每一个“可执行节点”（比如：HTTP 拉取、Shell 命令、读写文件、DNS 查询、TCP 探测等），生成一个 ExecGo `Task`：

- `task.id`：必须唯一（在同一张 `TaskGraph` 中）
- `task.type`：从节点类型映射到 ExecGo 执行器类型（`http/shell/file/sleep/dns/tcp/noop`）
- `task.params`：按该执行器的参数结构生成 JSON 对象
- `task.depends_on`：由你的工作流入边生成（见下一节）
- `task.retry` / `task.timeout`：按该节点的重试策略/超时策略填写

## 2. 工作流边（edge）-> `depends_on`

工作流中的依赖边 `A -> B`，在 ExecGo 中映射为：

- 给 `B` 这个任务设置 `depends_on: ["A"]`

> 注意：ExecGo 的 `depends_on` 只用来做“执行顺序/并发控制”，并不会自动把 A 的执行结果替换进 B 的 params。

## 3. 动态参数与“产物传递”

ExecGo 的“任务结果”会写入 `Task.result`（或失败时写入 `Task.error`），但运行时本身不提供“把上游 result 自动注入到下游 params”的变量替换。

因此常见有两种策略：

- 预先静态化：当你的 params 可以在提交前确定（例如固定 URL、固定命令、固定文件路径），一次性提交整张 DAG
- 分阶段提交：当你的下游 params 依赖上游运行结果时，上层编排层需要等待上游 `success/failed` 后，二次提交下一张 `TaskGraph`（并把上游 result 手工注入到下游 params）

下面的失败/轮询页面会给出分阶段提交的基本轮询方式。

## 4. 一份完整示例（3 个节点的 DAG）

假设你的工作流是：

- `fetch-data`：通过 HTTP 获取数据
- `save-result`：把数据写入文件
- `verify`：读取文件并校验

映射到 ExecGo 的 `TaskGraph` 可以是：

```json
{
  "tasks": [
    {
      "id": "fetch-data",
      "type": "http",
      "params": { "url": "https://httpbin.org/json", "method": "GET" },
      "retry": 1,
      "timeout": 10000
    },
    {
      "id": "save-result",
      "type": "file",
      "params": { "action": "write", "path": "output.txt", "content": "fetched!" },
      "depends_on": ["fetch-data"],
      "retry": 0,
      "timeout": 5000
    },
    {
      "id": "verify",
      "type": "file",
      "params": { "action": "read", "path": "output.txt" },
      "depends_on": ["save-result"],
      "retry": 2,
      "timeout": 5000
    }
  ]
}
```

> 说明：示例里 `save-result.params.content` 是静态值，实际落地时如果要把 `fetch-data` 的响应内容写入文件，你需要在编排层“分阶段提交”，把 fetch 的输出注入 content。

## 5. 提交前的校验清单（建议在编排层提前做）

为了尽量减少运行时返回 `400`（校验失败），建议你在本层先检查：

- 同一张图里 `id` 唯一且非空
- `type` 映射到运行时已注册的执行器类型
- `depends_on` 只引用图内的任务 id（且不自依赖）
- 工作流依赖关系无环（DAG）

