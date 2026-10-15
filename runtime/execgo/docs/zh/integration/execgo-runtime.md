# 对接 execgo-runtime（数据面运行时）

本文描述如何在 ExecGo（控制面）中无缝对接 `execgo-runtime`（数据面运行时），使 `type: "runtime"` 的任务通过 HTTP 提交到运行时，并支持：

- 轮询状态
- 取消（kill）
- 拉取事件（events）
- 探测运行时 capabilities/resources/info/config（可选）

## 1. 先启动 execgo-runtime

请参考 `execgo-runtime` 仓库 README 的启动方式（本地构建或容器均可）。默认监听示例为：

- `http://127.0.0.1:8080`

并提供就绪探针：

- `GET /readyz`

## 2. 在 ExecGo 中配置运行时地址

ExecGo 的 runtime 执行器通过环境变量读取运行时地址：

- `EXECGO_RUNTIME_URL`：运行时 HTTP 根地址（不带尾斜杠也可）

例如（ExecGo 进程启动前配置）：

```bash
export EXECGO_RUNTIME_URL=http://127.0.0.1:8080
```

## 3. 提交一个最小 runtime 任务

你只需要提交一个 `TaskGraph`，其中 task 的 `type` 设置为 `runtime`，并在 `input` 或 `params` 里放入 `execgo-runtime` 的提交 JSON（至少包含 `execution` 字段）。

示例请求（提交到 ExecGo 控制面）：

```bash
curl -X POST http://127.0.0.1:8080/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "tasks": [
      {
        "id": "rt-hello",
        "type": "runtime",
        "input": {
          "execution": {
            "kind": "command",
            "program": "/bin/sh",
            "args": ["-c", "echo hello"]
          }
        }
      }
    ]
  }'
```

说明：

- ExecGo 会在转发给 runtime 时自动注入 `task_id`（若你的 payload 未显式提供）。
- 返回的运行时结果会写入任务对象的 `runtime` 字段，并填充 `handle_id/run_status` 供轮询使用。

## 4. 轮询、取消与事件

### 4.1 轮询

对外轮询仍以 ExecGo 的任务查询接口为主（`GET /tasks/{id}`），其中 `runtime.status` 代表运行时状态（`accepted/running/success/failed/cancelled`）。

### 4.2 取消（kill）

取消行为由 runtime 执行器调用 `execgo-runtime` 的 `POST /api/v1/tasks/{ref}/kill` 完成。

其中 `{ref}` 默认使用 `handle_id`；若 runtime 端点实际使用 `task_id`，ExecGo 会在遇到 `404` 时自动回退到 `task_id` 再尝试。

### 4.3 事件（events）

runtime 执行器支持拉取事件 `GET /api/v1/tasks/{ref}/events`（同样具备 handle→task 的兼容回退）。

事件结构推荐与 `docs/zh/reference/runtime-semantics.md` 中 `RuntimeEvent` 对齐。

## 5. 运行时探测（可选）

runtime 执行器支持读取以下信息（用于未来调度/策略/运维展示）：

- `GET /api/v1/runtime/info`
- `GET /api/v1/runtime/capabilities`
- `GET /api/v1/runtime/resources`
- `GET /api/v1/runtime/config`

这些接口的原始 JSON 会被原样保留（ExecGo 侧不强行绑定严格结构），便于运行时独立演进。

