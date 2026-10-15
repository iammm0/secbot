# ExecGo — Agent Action Harness

> 面向 AI Agent 的执行内核 / action harness（控制面）

[![Go](https://img.shields.io/badge/Go-1.22+-00ADD8?logo=go)](https://go.dev)
[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![Core deps](https://img.shields.io/badge/Core%20module-stdlib%20only-blue.svg)]()

English README: [`README.md`](README.md)

---

## 简介

**ExecGo** 的核心模块（`github.com/iammm0/execgo`）仅依赖 Go 标准库；可选能力（SQLite 持久化、Redis 读穿缓存）放在独立子模块 `contrib/*` 中，避免强绑第三方依赖。

**定位说明**

ExecGo 更适合被理解为一个面向 AI Agent 的执行内核（execution kernel / action harness），而不是一个纯通用工作流引擎。它的职责是把上层 agent 的决策，可靠、安全、可观测地映射到真实工具与运行环境。

## 核心特性

| 特性 | 描述 |
|---|---|
| **Task DSL** | 严格的任务契约：支持 id, type, params, depends_on, retry, timeout |
| **DAG Scheduling** | 基于依赖图的任务编排，Kahn 算法环检测 |
| **Concurrent Execution** | goroutine + channel 并发模型，信号量控制最大并发 |
| **Pluggable Executors V2** | 内置 `os` / `mcp` / `cli-skills` / `runtime`；`os` 内含 shell/file/dns/tcp/sleep/noop/http 工具 |
| **Retry & Timeout** | 指数退避重试 + context 超时控制 |
| **State Persistence** | 内存存储 + JSON 文件定期持久化，崩溃恢复；可选 SQLite/Redis（contrib） |
| **Observability** | 结构化 JSON 日志 (slog) + traceID 追踪 + `/metrics` 端点 |
| **Graceful Shutdown** | 信号监听 → HTTP 关闭 → 调度器停止 → 状态持久化 |

---

## 架构

```
┌─────────────────────────────────────────────────────┐
│                    AI Agent (client)                 │
│              POST /tasks  ←→  GET /tasks/{id}       │
└─────────────────────┬───────────────────────────────┘
                      │ HTTP/JSON
┌─────────────────────▼───────────────────────────────┐
│                   API Layer (net/http)               │
│  POST /tasks │ GET /tasks/{id} │ DELETE │ /health   │
├─────────────────────┬───────────────────────────────┤
│               Scheduler (DAG)                       │
│  readyQueue(chan) │ semaphore │ dependency counter   │
├──────────┬──────────┬──────────┬────────────────────┤
│ OS       │ MCP      │ CLI+Skill│ ... (extensible)   │
│ Category │ Category │ Category │                    │
├──────────┴──────────┴──────────┴────────────────────┤
│ Optional: Runtime Executor (HTTP)                   │
│  submit/poll/cancel → execgo-runtime (/api/v1/tasks) │
├─────────────────────────────────────────────────────┤
│              Store (store.Store)                    │
│   jsonfile (default) │ sqlite │ + Redis (contrib)  │
├─────────────────────────────────────────────────────┤
│            Observability                            │
│    slog/JSON │ traceID │ /metrics                   │
└─────────────────────────────────────────────────────┘
```

### ExecGo 与 execgo-runtime 的关系

- ExecGo 是**控制面/编排面**：接收 `TaskGraph`，做 DAG 调度、幂等/重试/超时语义、状态存储与可观测性，并把任务分发给不同 executor。
- `execgo-runtime` 是**数据面/运行时执行器**（独立项目）：提供进程级执行、资源限制与（Linux-only）sandbox 能力，并持久化运行结果。ExecGo 通过内置 `runtime` executor 以 HTTP 调用 `execgo-runtime` 的 `/api/v1/tasks` 来提交/轮询/取消 `type=runtime` 的任务；不需要 runtime 的场景可以完全不部署它。

详见：[`docs/zh/overview/execgo-and-runtime.md`](docs/zh/overview/execgo-and-runtime.md)

---

## 快速开始

### 构建与运行

```bash
go build -o execgo ./cmd/execgo
./execgo

# 自定义配置
./execgo -addr :9090 -max-concurrency 20 -data-dir ./mydata

# 环境变量
EXECGO_ADDR=:9090 EXECGO_MAX_CONCURRENCY=20 ./execgo
```

### 适配器 CLI（`execgocli`）

面向 **Claude Code / Codex** 等接入方式，可构建通用 CLI（仅标准库 HTTP）：

```bash
go build -o execgocli ./cmd/execgocli
export EXECGO_URL=http://127.0.0.1:8080
./execgocli tools
```

- 中文：[模式 A（CLI）](docs/zh/integration/mode-a-cli.md) · [JSON 契约](docs/zh/reference/execgo-cli-contract.md)
- English: [Mode A (CLI)](docs/en/integration/mode-a-cli.md) · [JSON contract](docs/en/reference/execgo-cli-contract.md)
- **给 Codex / Claude Code / 自动化代理：** 已内置完整操作说明目录 **[`.skill/`](.skill/README.md)**；Cursor 项目技能入口见 **[`.cursor/skills/execgocli-adapter/SKILL.md`](.cursor/skills/execgocli-adapter/SKILL.md)**（指向同套内容）。

### 提交任务

单个任务：

```bash
curl -X POST http://localhost:8080/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "tasks": [
      {
        "id": "check-host",
        "type": "shell",
        "params": {"command": "hostname"},
        "retry": 2,
        "timeout": 5000
      }
    ]
  }'
```

DAG 工作流：

```bash
curl -X POST http://localhost:8080/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "tasks": [
      {
        "id": "fetch-data",
        "type": "http",
        "params": {"url": "https://httpbin.org/json", "method": "GET"},
        "timeout": 10000
      },
      {
        "id": "save-result",
        "type": "file",
        "params": {"action": "write", "path": "output.txt", "content": "fetched!"},
        "depends_on": ["fetch-data"]
      }
    ]
  }'
```

成熟 Agent Adapter（结构化 action）：

```bash
curl http://localhost:8080/adapters/tools

curl -X POST http://localhost:8080/adapters/actions \
  -H "Content-Type: application/json" \
  -d '{
    "adapter": "codex",
    "agent_id": "agent-1",
    "action_id": "hello-adapter",
    "action": {
      "kind": "os.noop",
      "input": {"message": "hello adapter"}
    }
  }'
```

---

## 文档入口

- 中文总入口：[`docs/zh/README.md`](docs/zh/README.md)
- 中文成熟 Agent Adapter 接入：[`docs/zh/integration/agent-adapter.md`](docs/zh/integration/agent-adapter.md)
- English entry: [`docs/en/README.md`](docs/en/README.md)

---

## 许可证

MIT

