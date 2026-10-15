# 命令行参考

入口：`execgo-runtime`（或由 `cargo run --` 调用）。

全局行为：通过子命令选择模式；`serve` 启动服务，其余子命令为**客户端**，使用 HTTP 访问远程服务。

## `serve`

启动 HTTP 服务。

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `--listen-addr` | `127.0.0.1:8080` | 监听地址。生产环境常设为 `0.0.0.0:8080` 并由反向代理 TLS 终结。 |
| `--data-dir` | `data` | 数据根目录（SQLite、任务目录）。 |
| `--max-running-tasks` | `4` | 并发运行任务上限。 |
| `--max-queued-tasks` | `128` | 队列中 `accepted` 任务上限；超出返回 429。 |
| `--termination-grace-ms` | `5000` | kill/超时后 SIGTERM 到 SIGKILL 的等待。 |
| `--result-retention-secs` | `604800` | 终态任务结果保留时间（约 7 天），供 GC 使用。 |
| `--gc-interval-ms` | `1000` | 垃圾回收轮询间隔。 |
| `--dispatch-poll-interval-ms` | `250` | 调度器在无通知时的轮询间隔（与内部 `Notify` 配合）。 |
| `--cgroup-root` | `/sys/fs/cgroup/execgo-runtime` | Linux cgroup v2 挂载点下用于每任务子目录（`linux_sandbox` 时）。 |
| `--runtime-id` | 自动生成 | 覆盖 runtime 节点 ID；也可用 `EXECGO_RUNTIME_ID`。 |
| `--default-capability-mode` | `adaptive` | 默认 capability 策略：`adaptive` 会显式降级，`strict` 会拒绝不满足能力的任务。 |
| `--disable-linux-sandbox` | `false` | 禁用 Linux sandbox capability，即使宿主环境看起来支持。 |
| `--disable-cgroup` | `false` | 禁用 cgroup capability 与对应增强语义。 |
| `--capacity-memory-bytes` | 自动探测 | 覆盖 ResourceLedger 的本机内存容量。 |
| `--capacity-pids` | 自动探测 | 覆盖 ResourceLedger 的本机 pids 容量。 |
| `--tenant-quota <SPEC>` | 可重复 | 配置租户软配额，格式 `tenant=slots:N[,memory:BYTES][,pids:N]`。 |

日志：默认 `tracing` JSON，可通过环境变量 `RUST_LOG` 调整（如 `RUST_LOG=info`）。

### `serve` 配置说明

`serve` 会在启动时完成 capability 探测，并把探测结果缓存在服务内。后续任务提交不会重新探测宿主环境；如果你改变了 cgroup 挂载、sandbox 权限或容量覆盖参数，需要重启 runtime。

常见启动形态：

```bash
# 本地开发：禁用 Linux sandbox/cgroup，减少平台差异
execgo-runtime serve \
  --listen-addr 127.0.0.1:8080 \
  --data-dir ./data \
  --disable-linux-sandbox \
  --disable-cgroup

# 多租户调度节点：限制并发、覆盖容量、配置租户软配额
execgo-runtime serve \
  --listen-addr 0.0.0.0:8080 \
  --data-dir /var/lib/execgo-runtime \
  --max-running-tasks 8 \
  --max-queued-tasks 512 \
  --capacity-memory-bytes 17179869184 \
  --capacity-pids 2048 \
  --tenant-quota alice=slots:2,memory:2147483648,pids:256 \
  --tenant-quota bob=slots:4,memory:4294967296,pids:512
```

租户配额只在任务带 `control_context.tenant` 时生效。未配置配额的租户仍受 runtime 总容量约束。

## `submit`

提交任务。必须提供 `--json` 或 `--file` 之一。

| 参数 | 默认值 | 说明 |
|------|--------|------|
| `--server` | `http://127.0.0.1:8080` | 服务根 URL。 |
| `--json` | — | 请求 JSON 字符串。 |
| `--file` | — | 请求 JSON 文件路径。 |
| `--poll-interval-ms` | `500` | 供其他子命令复用字段；`submit` 本身仅 POST。 |
| `--timeout-ms` | — | 同上，对 `submit` 无等待语义。 |

成功时向标准输出打印响应 JSON。

`--server` 末尾的 `/` 会被自动裁剪，因此 `http://127.0.0.1:8080` 和 `http://127.0.0.1:8080/` 等价。

请求文件示例：

```json
{
  "task_id": "docs-cli-demo",
  "execution": {
    "kind": "command",
    "program": "/bin/sh",
    "args": ["-c", "echo $GREETING && pwd"],
    "env": {
      "GREETING": "hello from execgo-runtime"
    }
  },
  "limits": {
    "wall_time_ms": 30000,
    "memory_bytes": 536870912,
    "stdout_max_bytes": 65536,
    "stderr_max_bytes": 65536
  },
  "sandbox": {
    "profile": "process",
    "workspace_subdir": "cli-demo"
  },
  "control_context": {
    "tenant": "alice",
    "owner": "alice"
  },
  "metadata": {
    "source": "cli-docs"
  }
}
```

提交：

```bash
execgo-runtime submit --server http://127.0.0.1:8080 --file ./task.json
```

## `status`

查询任务：`execgo-runtime status <task_id>`。

| 参数 | 说明 |
|------|------|
| `--server` | 同 `submit`。 |
| `task_id` | 位置参数。 |

## `wait`

阻塞轮询直到任务进入终态。

| 参数 | 说明 |
|------|------|
| `--server` | 服务根 URL。 |
| `task_id` | 任务 ID。 |
| `--timeout-ms` | 可选；超时则进程以非零退出并打印错误。 |
| `--poll-interval-ms` | 默认 `500`。 |

## `kill`

`execgo-runtime kill <task_id>`，语义同 API `POST .../kill`。

| 参数 | 说明 |
|------|------|
| `--server` | 服务根 URL。 |
| `--owner` | 可选；设置后通过 `x-execgo-owner` header 传给 runtime。也可用 `EXECGO_RUNTIME_OWNER`。 |
| `task_id` | 任务 ID。 |

如果任务提交时包含 `control_context.owner`，取消时必须传入相同 owner：

```bash
execgo-runtime kill \
  --server http://127.0.0.1:8080 \
  --owner alice \
  docs-cli-demo
```

owner 不匹配时 CLI 会以非零状态退出，并打印服务端错误。

## `run`

等价于 **提交 + `wait`**：先 `POST /api/v1/tasks`，再对返回的 `task_id` 执行与 `wait` 相同的轮询逻辑。

适合脚本中「跑完一条任务并拿到最终 JSON」。

`run` 与 `submit` 使用同一组输入参数，因此支持 `--json` 和 `--file`。当任务进入终态后，CLI 会把最终 `TaskStatusResponse` 打印到 stdout；调用方可根据 `status`、`error.code`、`exit_code` 和 `stdout` 决定后续动作。

## `internal-shim`（隐藏）

由运行时**自动** fork，不应手工用于正常运维。用于从数据库加载任务并执行用户进程。

手工调用 `internal-shim` 可能绕过服务端调度、恢复和资源账本语义，除非你正在调试 runtime 自身，否则不要使用。

---

## 示例

```bash
# 前台启动（开发）
execgo-runtime serve --listen-addr 127.0.0.1:8080 --data-dir ./data

# 从文件提交
execgo-runtime submit --server http://127.0.0.1:8080 --file ./task.json

# 同步执行至结束
execgo-runtime run --json '{"execution":{"kind":"command","program":"/bin/sh","args":["-c","date"]}}'

# 读取能力清单（CLI 暂无专门子命令，可用 curl）
curl -sS http://127.0.0.1:8080/api/v1/runtime/capabilities
```

## 环境变量速查

| 变量 | 使用位置 | 说明 |
|------|----------|------|
| `RUST_LOG` | 服务端与 CLI | 日志级别，如 `info`、`debug`。 |
| `EXECGO_RUNTIME_ID` | `serve` | 覆盖 runtime 节点 ID。 |
| `EXECGO_RUNTIME_DEFAULT_CAPABILITY_MODE` | `serve` | 默认 capability mode：`adaptive` 或 `strict`。 |
| `EXECGO_RUNTIME_DISABLE_LINUX_SANDBOX` | `serve` | 禁用 Linux sandbox 探测。 |
| `EXECGO_RUNTIME_DISABLE_CGROUP` | `serve` | 禁用 cgroup 探测与 enforcement。 |
| `EXECGO_RUNTIME_CAPACITY_MEMORY_BYTES` | `serve` | 覆盖 ResourceLedger 内存容量。 |
| `EXECGO_RUNTIME_CAPACITY_PIDS` | `serve` | 覆盖 ResourceLedger pids 容量。 |
| `EXECGO_RUNTIME_OWNER` | `kill` | CLI 取消任务时的 owner header。 |
