# 模式 A 快速开始：execgocli

**模式 A**：`GET /adapters/tools` 发现能力 → `POST /adapters/actions` 提交 action → `GET /tasks/{id}` 轮询。`execgocli` 在 stdout 输出统一 JSON 外壳，便于 agent 解析。

## 1) 启动 ExecGo

```bash
go build -o execgo ./cmd/execgo
./execgo
```

默认 HTTP 端口 `:8080`（见 `EXECGO_ADDR`）。

## 2) 构建 execgocli

```bash
go build -o execgocli ./cmd/execgocli
export EXECGO_URL=http://127.0.0.1:8080
```

## 3) 拉取 tools manifest

```bash
./execgocli tools
```

## 4) 执行一条 action 并取 task id

```bash
./execgocli act <<'EOF'
{
  "adapter": "codex",
  "agent_id": "agent-1",
  "action_id": "demo-1",
  "action": { "kind": "os.noop", "input": {} }
}
EOF
```

从 `data.task_ids[0]` 或 `data.task_graph` 获取信息。

## 5) 等待终态

```bash
./execgocli wait -task-ids demo-1 -timeout 2m
```

## 6) 可选：ensure-running

若本机有 ExecGo 仓库且含 `docker-compose.yml`：

```bash
export EXECGO_COMPOSE_DIR=/你的/execgo/路径
./execgocli ensure-running
```

若还需探活 **execgo-runtime**（`{EXECGO_RUNTIME_URL}/readyz`）：

```bash
export EXECGO_RUNTIME_URL=http://127.0.0.1:18080
# 使用 runtime 类 action 时，启动 ExecGo 的进程也须配置相同 EXECGO_RUNTIME_URL
./execgocli ensure-running -with-runtime
```

`EXECGO_RUNTIME_IMAGE` 非空时，可能尝试 `docker run` 做本机体验；**生产**请用常规编排与监控，勿依赖该捷径。

## 排错

| 现象 | 建议 |
| --- | --- |
| `act` 返回 `ok: false` | 看 `error.body`，多为字段校验不通过 |
| `wait` 退出码 3 | 超时内未达终态；调大 `-timeout` 或看队列/并发 |
| runtime 类任务卡住 | 确认 `EXECGO_RUNTIME_URL` 与 runtime 真进程一致；`curl …/readyz` |
| `ensure-running` 仍失败 | 无 Docker/权限/端口占用；看 JSON 里 `manual_hints` 手动启动 |

## 契约

- [execgocli JSON 契约](../reference/execgo-cli-contract.md)

## 参见

- [成熟 Agent 接入](agent-adapter.md)
- [模式 B 升级路径](mode-b-upgrade.md)
