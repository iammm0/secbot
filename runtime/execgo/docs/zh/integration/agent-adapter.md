# 通用 Agent 可靠执行层接入

ExecGo 现在有两条 HTTP 接入路径：

- 低层路径：把完整 `TaskGraph` 直接提交到 `POST /tasks`。
- 成熟 agent 路径：先用 `GET /adapters/tools` 发现能力，再把结构化 action 提交到 `POST /adapters/actions`。

Adapter 路径面向 Claude Code / Codex / Hermes Agent / OpenClaw 这类通用或成熟 agent。它不解析自然语言，也不绑定这些 agent 的私有内部协议；它只接受显式 JSON action，并由伴生 `AdapterKernel` 确定性翻译成 ExecGo 已有的 Task DSL。

推荐的边界是：agent 负责上下文理解、计划拆解和工具选择；ExecGo 负责执行前校验、依赖调度、重试/超时/取消、状态持久化与审计。这样可以把临时 shell、文件操作、runtime 命令或 MCP/CLI 调用，从“聊天上下文里的动作”变成可追踪的工程任务。

**通用 CLI：** 在仓库内构建 `execgocli`（`cmd/execgocli`）即可用稳定 JSON 外壳走同一套 HTTP 流程，见 [模式 A 快速开始（CLI）](mode-a-cli.md) 与 [execgocli JSON 契约](../reference/execgo-cli-contract.md)。**模式 B**（`translate` + `POST /tasks`）见 [模式 B 升级路径](mode-b-upgrade.md)。

## 端点

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| `GET` | `/adapters/capabilities` | 返回 adapter schema version、支持的 profile 与 action kind。 |
| `GET` | `/adapters/tools` | 返回适合 agent 暴露为 tools/skills 的 ExecGo 能力清单。 |
| `POST` | `/adapters/translate` | 只翻译 action 到 TaskGraph，不提交执行。 |
| `POST` | `/adapters/actions` | 翻译并提交 action，进入正常 scheduler/executor/store 流程。 |

`POST /tasks` 仍然是直接提交 Task DSL 的路径，行为不变。

## 支持的 Action Kind

- OS 能力：`os.shell`、`os.file`、`os.http`、`os.dns`、`os.tcp`、`os.sleep`、`os.noop`
- Runtime 能力：`runtime.command`、`runtime.script`
- 扩展能力：`mcp.call`、`cli.run`
- 直通能力：`task_graph.submit`

常见别名也会被归一化：

- `shell`、`bash`、`terminal.command` -> `os.shell`
- `file.read`、`file.write` -> `os.file`
- `http.request` -> `os.http`
- `command` -> `runtime.command`
- `script` -> `runtime.script`

## 最小 OS Action

```bash
curl -X POST http://localhost:8080/adapters/actions \
  -H "Content-Type: application/json" \
  -d '{
    "adapter": "codex",
    "agent_id": "agent-1",
    "action_id": "hello-adapter",
    "action": {
      "kind": "os.noop",
      "input": {
        "message": "hello adapter"
      }
    }
  }'
```

响应会包含 `accepted`、`task_ids`、翻译后的 `task_graph` 和 `translation_trace`。之后仍然用标准任务接口轮询：

```bash
curl http://localhost:8080/tasks/hello-adapter
```

## Runtime Command Action

当 agent 需要 ExecGo 提供运行时调度、进程分配、sandbox 策略和资源限制时，优先使用 `runtime.command` 或 `runtime.script`。

```bash
curl -X POST http://localhost:8080/adapters/actions \
  -H "Content-Type: application/json" \
  -d '{
    "adapter": "codex",
    "agent_id": "agent-1",
    "session_id": "session-1",
    "action_id": "build-test",
    "action": {
      "kind": "runtime.command",
      "input": {
        "program": "go",
        "args": ["test", "./..."],
        "limits": {
          "wall_time_ms": 300000,
          "memory_bytes": 1073741824,
          "pids_max": 128
        },
        "sandbox": {
          "profile": "process"
        },
        "control_context": {
          "tenant": "default",
          "owner": "agent-1",
          "requires_resource_reservation": true
        }
      },
      "timeout": 300000,
      "retry": 1
    }
  }'
```

Adapter 会把这个 action 翻译为 `type=runtime` 的任务。后续由现有 runtime executor 按 `execgo-runtime` 的 `/api/v1/tasks` 契约提交、轮询和取消。

## 只翻译不提交

调试伴生内核翻译结果时，使用 `/adapters/translate`：

```bash
curl -X POST http://localhost:8080/adapters/translate \
  -H "Content-Type: application/json" \
  -d '{
    "adapter": "claudecode",
    "action_id": "list-files",
    "action": {
      "kind": "shell",
      "input": {
        "command": "ls",
        "args": ["-la"]
      }
    }
  }'
```

这个端点只返回 TaskGraph，不会创建任务状态。agent 准备真正执行时，再把同样的 payload 发到 `/adapters/actions`。
