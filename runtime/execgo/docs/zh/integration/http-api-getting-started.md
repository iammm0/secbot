# HTTP API 入门使用文档

这是一份面向第一次接入 ExecGo 的中文入门指南。它不追求覆盖所有细枝末节，而是优先帮助你把链路跑通，并理解几个最容易踩坑的真实行为。

如果你只想先跑通最小示例，先看“5 分钟跑通”；如果你准备做正式集成，建议至少再看完“任务模型”“轮询与状态”“常见坑与最佳实践”。

## 1. 先记住 7 个事实

1. `POST /tasks` 是异步提交接口，返回 `202 Accepted` 只代表“已接收”，不代表任务已经执行成功。
2. 一次提交的请求体是一个 `TaskGraph`，核心字段是 `tasks` 数组。
3. `depends_on` 只表达调度顺序，不会自动把上游 `result` 注入到下游 `params`。
4. 你可以直接提交 `noop`、`shell`、`file`、`http`、`dns`、`tcp`、`sleep` 这些便捷类型；服务端会在执行前把它们规范化成 `type: "os"` 加 `tool_name`。
5. 因为查询结果是规范化后的任务对象，所以你提交时写的是 `type: "noop"`，查询时很可能看到的是 `type: "os"`、`tool_name: "noop"`。
6. `task.id` 在默认存储里是全局键。如果你重复提交同一个 `task.id`，旧状态可能会被新的提交覆盖。
7. `DELETE /tasks/{id}` 只删除状态记录，不等价于取消正在运行的任务。

## 2. 服务怎么启动

### 2.1 构建和运行

```bash
go build -o execgo ./cmd/execgo
./execgo
```

默认行为：

- HTTP 监听地址：`:8080`
- gRPC 监听地址：`:50051`
- 数据目录：`./data`
- 最大并发：`10`
- 优雅停机超时：`15s`

### 2.2 常用启动参数

```bash
./execgo \
  -addr :9090 \
  -grpc-addr :50052 \
  -data-dir ./mydata \
  -max-concurrency 20 \
  -shutdown-timeout 30
```

### 2.3 等价环境变量

```bash
EXECGO_ADDR=:9090 \
EXECGO_GRPC_ADDR=:50052 \
EXECGO_DATA_DIR=./mydata \
EXECGO_MAX_CONCURRENCY=20 \
EXECGO_SHUTDOWN_TIMEOUT=30 \
./execgo
```

### 2.4 持久化行为

默认存储实现会把任务状态保存在 `data/state.json`：

- 运行中每 30 秒刷盘一次
- 正常退出时会再做一次最终刷盘
- 服务重启恢复时，之前处于 `running` 的任务会被重置为 `pending`

如果你准备把 ExecGo 当作可恢复的执行内核使用，这个行为值得提前知道。

## 3. HTTP 端点总览

| 方法 | 路径 | 用途 | 常见状态码 |
| --- | --- | --- | --- |
| `POST` | `/tasks` | 提交一个任务图 | `202`, `400` |
| `GET` | `/tasks/{id}` | 查询单个任务状态与结果 | `200`, `404` |
| `GET` | `/tasks` | 列出当前所有任务 | `200` |
| `DELETE` | `/tasks/{id}` | 删除任务状态记录 | `204`, `404` |
| `GET` | `/health` | 健康检查 | `200` |
| `GET` | `/metrics` | JSON 指标快照 | `200` |
| `GET` | `/mcp/tools` | 列出 MCP 工具 | `200`, `503` |
| `POST` | `/mcp/call` | 调用 MCP 工具 | `202`, `400`, `500`, `503` |
| `GET` | `/mcp/tasks/{id}` | 轮询 MCP 句柄结果 | `200`, `404`, `503` |

说明：

- 除了 `DELETE /tasks/{id}` 成功时返回 `204 No Content` 外，其余端点都返回 JSON。
- 当前版本没有内建认证、鉴权和限流。
- 默认会为每个请求生成并回传 `X-Trace-ID` 响应头；如果你自己传了 `X-Trace-ID`，服务会原样沿用，方便串联日志。

## 4. 5 分钟跑通

这一节只用 `noop` 工具，不依赖外部网络，也不会修改系统状态。

### 4.1 健康检查

```bash
curl -i http://localhost:8080/health
```

示例响应：

```http
HTTP/1.1 200 OK
Content-Type: application/json
X-Trace-Id: 33216a3e5682498b

{"status":"ok","version":"v1.1.0","uptime":"9s"}
```

### 4.2 提交第一个任务

```bash
curl -X POST http://localhost:8080/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "tasks": [
      {
        "id": "hello-noop",
        "type": "noop",
        "params": {
          "message": "hello api"
        }
      }
    ]
  }'
```

示例响应：

```json
{
  "accepted": 1,
  "task_ids": ["hello-noop"]
}
```

这一步只有两层含义：

- 服务成功收到了 1 个任务
- 真正的执行在后台开始

### 4.3 轮询任务结果

```bash
curl http://localhost:8080/tasks/hello-noop
```

一次成功执行后的示例响应如下：

```json
{
  "id": "hello-noop",
  "type": "os",
  "params": {
    "message": "hello api"
  },
  "tool_name": "noop",
  "input": {
    "message": "hello api"
  },
  "execution_category": "os",
  "status": "success",
  "run_status": "success",
  "result": {
    "message": "hello api",
    "ok": true
  },
  "runtime": {
    "status": "success",
    "output": {
      "message": "hello api",
      "ok": true
    },
    "started_at": "2026-04-03T10:14:23.80576+08:00",
    "finished_at": "2026-04-03T10:14:23.805773+08:00",
    "attempt": 1,
    "details": null
  },
  "created_at": "2026-04-03T10:14:23.805718+08:00",
  "updated_at": "2026-04-03T10:14:23.805778+08:00"
}
```

这里最需要注意的 4 个字段是：

- `status`：编排层面的任务状态，轮询时最先看它
- `result`：兼容字段，很多简单客户端直接读取它就够了
- `runtime`：更规范的运行时包络，包含开始时间、结束时间、尝试次数和结构化错误
- `type` / `tool_name`：你提交时是 `noop`，查询时变成了 `type: "os"` + `tool_name: "noop"`

## 5. 任务模型怎么理解

### 5.1 最小请求体

所有任务提交都遵循这个外层结构：

```json
{
  "tasks": [
    {
      "id": "task-1",
      "type": "noop",
      "params": {
        "message": "hello"
      }
    }
  ]
}
```

### 5.2 常用字段说明

| 字段 | 位置 | 是否常用 | 说明 |
| --- | --- | --- | --- |
| `id` | `task` | 必填 | 任务唯一标识 |
| `type` | `task` | 必填 | 任务类型 |
| `params` | `task` | 常用 | 便捷类型常用输入字段 |
| `depends_on` | `task` | 常用 | 依赖的上游任务 ID 列表 |
| `retry` | `task` | 可选 | 失败后的额外重试次数 |
| `timeout` | `task` | 可选 | 单次执行超时，单位毫秒 |
| `tool_name` | `task` | 高级 | 使用 `type: "os"` 或 `type: "mcp"` 时指定具体工具名 |
| `input` | `task` | 高级 | 与 `tool_name` 配套的输入体 |

### 5.3 两种提交风格

#### 风格 A：便捷别名，最适合第一次接入

```json
{
  "id": "task-1",
  "type": "shell",
  "params": {
    "command": "hostname"
  }
}
```

#### 风格 B：规范化 V2 风格

```json
{
  "id": "task-1",
  "type": "os",
  "tool_name": "shell",
  "input": {
    "command": "hostname"
  }
}
```

两种写法最终都会走同一套执行逻辑。对大多数 HTTP 客户端来说，建议先用风格 A，简单直观。

### 5.4 任务状态

`GET /tasks/{id}` 里的 `status` 可能是：

- `pending`：已入库，等待调度
- `running`：正在执行
- `success`：执行成功
- `failed`：执行失败
- `skipped`：因为依赖失败而被跳过

轮询的停止条件通常就是看到 `success`、`failed` 或 `skipped`。

### 5.5 `status`、`run_status`、`runtime.status` 的关系

可以先用下面这个规则理解：

- `status` 是编排层状态，决定你要不要继续轮询
- `run_status` 是字符串形式的运行时状态，方便简单客户端读取
- `runtime.status` 是结构化运行时状态，搭配 `runtime.error`、`attempt`、`duration_ms` 一起用

如果你只是做一个最小客户端，先看 `status`，成功后读 `result`，失败后读 `error`，已经够用。

## 6. 正确的轮询方式

推荐流程：

1. `POST /tasks` 拿到 `task_ids`
2. 针对每个 `task_id` 轮询 `GET /tasks/{id}`
3. 如果状态是 `pending` 或 `running`，继续轮询
4. 如果状态是 `success`、`failed` 或 `skipped`，停止轮询并处理结果

推荐退避策略：

- 初始间隔：`500ms`
- 每次乘以 `1.5` 到 `2`
- 最大间隔：`5s`

一个非常实用的判断逻辑是：

```text
success -> 读取 result 或 runtime.output
failed  -> 读取 error 或 runtime.error
skipped -> 读取 error，通常是依赖失败
```

如果你要处理重试、超时、机器可读错误码，优先读 `runtime.error`。

## 7. DAG 示例：写文件再读取

这个例子演示两件事：

- `depends_on` 如何控制执行顺序
- 上游结果不会自动注入下游

```bash
curl -X POST http://localhost:8080/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "tasks": [
      {
        "id": "write-demo-file",
        "type": "file",
        "params": {
          "action": "write",
          "path": "tmp/api-demo.txt",
          "content": "hello from execgo"
        }
      },
      {
        "id": "read-demo-file",
        "type": "file",
        "params": {
          "action": "read",
          "path": "tmp/api-demo.txt"
        },
        "depends_on": ["write-demo-file"]
      }
    ]
  }'
```

提交成功后，继续查询：

```bash
curl http://localhost:8080/tasks/read-demo-file
```

你会拿到类似下面的结果：

```json
{
  "status": "success",
  "tool_name": "file",
  "result": {
    "content": "hello from execgo",
    "size": 17
  }
}
```

注意：

- `read-demo-file` 能运行，是因为依赖满足了
- 它读取的是服务端文件系统上的 `tmp/api-demo.txt`
- 它并不是自动拿到了 `write-demo-file.result`

如果你的下游任务真的依赖上游结果内容，需要在编排层分阶段提交，把上游 `result` 自己填进下一次提交的 `params`

## 8. 失败、跳过、超时分别长什么样

### 8.1 失败示例

下面的 shell 任务会因为命令不在白名单中而失败：

```bash
curl -X POST http://localhost:8080/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "tasks": [
      {
        "id": "bad-shell",
        "type": "shell",
        "params": {
          "command": "not-a-real-whitelisted-command"
        }
      }
    ]
  }'
```

查询结果时你会看到类似：

```json
{
  "status": "failed",
  "error": "command \"not-a-real-whitelisted-command\" is not in the allowed whitelist",
  "runtime": {
    "status": "failed",
    "error": {
      "code": "external_failure",
      "message": "command \"not-a-real-whitelisted-command\" is not in the allowed whitelist",
      "source": "executor"
    }
  }
}
```

### 8.2 `skipped` 示例

如果下游依赖上游，而上游失败，下游会被跳过：

```json
{
  "id": "downstream-task",
  "depends_on": ["bad-shell"],
  "status": "skipped",
  "error": "dependency bad-shell failed"
}
```

### 8.3 超时 + 重试示例

```bash
curl -X POST http://localhost:8080/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "tasks": [
      {
        "id": "timeout-demo",
        "type": "sleep",
        "params": {
          "duration_ms": 300
        },
        "timeout": 100,
        "retry": 1
      }
    ]
  }'
```

一个实际失败结果的关键字段会像这样：

```json
{
  "status": "failed",
  "retry": 1,
  "timeout": 100,
  "runtime": {
    "status": "failed",
    "attempt": 2,
    "duration_ms": 100,
    "error": {
      "code": "timeout",
      "message": "context deadline exceeded",
      "retryable": true,
      "source": "scheduler"
    }
  }
}
```

这里的 `attempt: 2` 表示：

- 第 1 次执行超时
- 按 `retry: 1` 再重试 1 次
- 最终仍失败

## 9. 内置任务类型速查

### 9.1 推荐新手先用这些便捷类型

| 类型 | 用途 | 最小 `params` 示例 |
| --- | --- | --- |
| `noop` | 不做外部 IO，适合联调 | `{"message":"hello"}` |
| `sleep` | 延时与超时测试 | `{"duration_ms":500}` |
| `shell` | 执行白名单命令或脚本 | `{"command":"hostname"}` |
| `file` | 读写文件 | `{"action":"read","path":"tmp/a.txt"}` |
| `http` | 发起 HTTP 请求 | `{"url":"https://example.com","method":"GET"}` |
| `dns` | DNS 查询 | `{"name":"example.com","record":"ip"}` |
| `tcp` | TCP 连通性探测 | `{"address":"example.com:443"}` |

### 9.2 每种类型的关键点

#### `noop`

- 适合做链路验通和 DAG 验证
- 返回结果结构通常是 `{ "ok": true, "message": "..." }`

#### `sleep`

- 常用于测试 `timeout`、`retry` 和调度行为
- 最大单次休眠上限是 10 分钟

#### `shell`

- 支持直接命令模式，例如：

```json
{"command":"hostname"}
```

- 也支持脚本模式，例如：

```json
{"runner":"auto","script":"echo hello"}
```

- 默认只允许白名单命令
- 如果你显式设置环境变量 `EXECGO_SHELL_POLICY=open`，才会跳过白名单限制

#### `file`

- 支持 `read`、`write`、`append`、`delete`、`stat`
- `write` 会自动创建父目录
- 路径会先做清理，但仍然是服务端本地文件系统操作

#### `http`

- 支持 `url`、`method`、`headers`、`body`
- 响应体会限制在 1MB 内
- 当前实现下，目标服务返回 `4xx/5xx` 时，任务通常仍然是 `success`，你要自己检查 `result.status_code`
- 真正会让任务进入 `failed` 的，更多是网络错误、上下文超时、请求构造失败等执行层错误

#### `dns`

- 支持 `record: "ip" | "txt" | "cname"`
- 默认是 `ip`

#### `tcp`

- 用于探测 `host:port` 是否能连通
- 可选字段 `timeout_ms`

## 10. `GET /tasks`、`DELETE /tasks/{id}`、`/metrics` 怎么用

### 10.1 列出所有任务

```bash
curl http://localhost:8080/tasks
```

返回值是任务数组。因为默认实现底层是 map，返回顺序不保证稳定，如果你要展示列表，建议客户端自行排序。

### 10.2 删除任务记录

```bash
curl -X DELETE http://localhost:8080/tasks/hello-noop -i
```

成功时返回：

```http
HTTP/1.1 204 No Content
```

再次删除同一个任务通常会得到：

```json
{
  "error": "task not found: hello-noop"
}
```

### 10.3 查看指标

```bash
curl http://localhost:8080/metrics
```

示例响应：

```json
{
  "tasks_total": 4,
  "tasks_running": 0,
  "tasks_succeeded": 2,
  "tasks_failed": 2,
  "by_type": {
    "os": 4
  }
}
```

请注意，`/metrics` 当前返回的是 JSON 快照，不是 Prometheus 文本格式。

## 11. MCP 子接口怎么快速试

如果你暂时只关心任务执行，可以先跳过这一节。

### 11.1 列出工具

```bash
curl http://localhost:8080/mcp/tools
```

示例响应：

```json
{
  "tools": [
    {
      "name": "mcp.execute",
      "category": "mcp",
      "description": "Execute MCP task and return handle",
      "input_schema": {
        "type": "object"
      }
    }
  ]
}
```

### 11.2 调用工具

```bash
curl -X POST http://localhost:8080/mcp/call \
  -H "Content-Type: application/json" \
  -d '{
    "id": "mcp-demo",
    "tool_name": "demo.echo",
    "input": {
      "hello": "world"
    }
  }'
```

当前仓库默认实现的 MCP 执行器更像一个占位版本，主要用于验证异步句柄链路。默认行为会把输入原样回显，因此一个典型响应可能直接就是：

```json
{
  "task_id": "mcp-demo",
  "status": "success",
  "handle_id": "mcp-1775182513428872000",
  "output": {
    "echo": {
      "hello": "world"
    },
    "tool_name": "demo.echo"
  }
}
```

如果你接入了真实扩展，实现可能会先返回 `accepted` 或 `running`，这时继续轮询：

```bash
curl http://localhost:8080/mcp/tasks/mcp-1775182513428872000
```

## 12. 常见 400/404 错误

### 12.1 空任务图

请求：

```json
{"tasks":[]}
```

响应：

```json
{
  "error": "task graph is empty"
}
```

### 12.2 未知任务类型

请求：

```json
{
  "tasks": [
    {
      "id": "bad-type",
      "type": "badtype"
    }
  ]
}
```

响应：

```json
{
  "error": "unknown task type: badtype (available: cli-skills, mcp, os)"
}
```

这里有一个很容易困惑的点：虽然错误信息里列出来的是注册表里的大类 `cli-skills`、`mcp`、`os`，但你依然可以提交 `noop`、`shell`、`file` 这类便捷类型，因为它们会先被规范化到 `os`。

### 12.3 任务不存在

```bash
curl http://localhost:8080/tasks/not-found
```

响应：

```json
{
  "error": "task not found: not-found"
}
```

## 13. 最值得提前规避的坑

### 13.1 不要把 `202 Accepted` 当成成功执行

正确做法是“提交后轮询”，而不是“提交后立刻取结果”。

### 13.2 不要假设下游能自动拿到上游结果

ExecGo 当前不会做变量注入或模板替换。依赖关系只控制顺序，不传数据。

### 13.3 不要在不确认的情况下重复使用同一个 `task.id`

默认存储里同 ID 会覆盖。正式接入时，你需要先决定自己的幂等策略：

- 要么提交前先查询是否已存在
- 要么把业务 run id / attempt id 编进 `task.id`

如果你要深入处理这个问题，继续读：[轮询与幂等：稳定提交与读取结果](../orchestrator/polling-and-idempotency.md)

### 13.4 不要忽略规范化后的字段

很多人提交 `type: "shell"` 以后，看到查询结果里的 `type: "os"` 会以为服务改写错了。其实这是设计行为，不是异常。

### 13.5 不要只看 `status`，忽略 `result.status_code`

尤其是 `http` 工具。目标服务的 `404` 或 `500` 不一定让任务本身进入 `failed`。

### 13.6 生产环境不要直接裸奔暴露

当前版本没有内建：

- 鉴权
- 访问控制
- 限流
- 审计策略

如果你要对外暴露 API，建议前面至少放一层网关或反向代理。

## 14. 下一步看什么

根据你的角色，可以继续看这些文档：

- 想看精确端点与错误语义：[`docs/zh/reference/api.md`](../reference/api.md)
- 想看任务字段、DAG 校验和 DSL：[`docs/zh/reference/task-dsl.md`](../reference/task-dsl.md)
- 想看多语言客户端示例：[`Go`](./client-go.md)、[`Java`](./client-java.md)、[`Python`](./client-python.md)、[`Node.js + TypeScript`](./client-nodejs-ts.md)
- 想了解上层编排怎么做：[`docs/zh/orchestrator/README.md`](../orchestrator/README.md)

如果你只是想先验证接入是否成功，一个很稳妥的顺序是：

1. `GET /health`
2. 提交一个 `noop`
3. 轮询到 `success`
4. 提交一个 `sleep` + `timeout`
5. 再提交一个简单 DAG

这样你会很快知道：服务可用、状态流转正常、错误语义正常、依赖调度也正常。
