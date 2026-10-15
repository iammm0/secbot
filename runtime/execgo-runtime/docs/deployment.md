# 部署与运维

## 二进制部署

1. 在目标机器安装兼容的 libc（Linux 常见为 glibc，与构建机一致可减少问题）。
2. `cargo build --release`，将 `target/release/execgo-runtime` 拷贝到 `PATH` 中。
3. 使用 systemd、supervisor 或容器编排启动 `serve`，并持久化 `--data-dir`。

建议：

- 仅内网或通过反向代理暴露；API 当前无内置认证，需在网络层或网关层做鉴权。
- 磁盘：为 `data-dir` 预留足够空间用于日志与任务产物。
- 备份：定期备份 `runtime.db` 与业务需要的 `tasks/` 子目录。
- 权限：运行用户需要对 `--data-dir` 有读写权限；若启用 Linux sandbox/cgroup，还需要宿主提供对应 namespace、chroot、cgroup v2 写入能力。

### systemd 示例

以下示例适合单机或 VM 部署。请按实际二进制路径、运行用户和容量调整：

```ini
[Unit]
Description=ExecGo Runtime
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=execgo
Group=execgo
WorkingDirectory=/var/lib/execgo-runtime
Environment=RUST_LOG=info
Environment=EXECGO_RUNTIME_ID=runtime-prod-1
ExecStart=/usr/local/bin/execgo-runtime serve \
  --listen-addr 127.0.0.1:8080 \
  --data-dir /var/lib/execgo-runtime \
  --max-running-tasks 8 \
  --max-queued-tasks 512 \
  --result-retention-secs 604800 \
  --capacity-memory-bytes 17179869184 \
  --capacity-pids 2048
Restart=on-failure
RestartSec=3
NoNewPrivileges=true

[Install]
WantedBy=multi-user.target
```

如果 runtime 只由同机 ExecGo 控制面调用，建议监听 `127.0.0.1`。如果需要跨主机访问，优先放在内网地址后面，并用反向代理或服务网格做 TLS 与鉴权。

### 数据目录

`--data-dir` 是 runtime 的核心持久化边界：

```text
/var/lib/execgo-runtime/
  runtime.db
  runtime.db-wal
  runtime.db-shm
  tasks/
    <task_id>/
      request.json
      result.json
      stdout.log
      stderr.log
      workspace/
```

运维建议：

- 把 `data-dir` 放在持久卷，而不是容器临时层。
- 如果 stdout/stderr 可能很大，结合任务 `limits.stdout_max_bytes` / `stderr_max_bytes` 和业务归档策略控制磁盘增长。
- `result-retention-secs` 到期后终态任务会被 GC；需要长期审计时先归档 `tasks/<task_id>/`。
- SQLite 使用 WAL，备份时应同时考虑 `runtime.db`、`runtime.db-wal`、`runtime.db-shm`，或先停止服务再做文件级备份。

## 健康检查

- **存活**：`GET /healthz`
- **就绪**：`GET /readyz`（验证存储可用）
- **能力清单**：`GET /api/v1/runtime/capabilities`
- **资源快照**：`GET /api/v1/runtime/resources`

编排时可配置：

- liveness → `/healthz`
- readiness → `/readyz`

如果 `/healthz` 正常但 `/readyz` 失败，优先检查 `--data-dir` 权限、磁盘空间、SQLite 文件锁和卷挂载状态。

## 指标与监控

`GET /metrics` 提供 Prometheus 文本。可在 Prometheus 中抓取该路径，或交给 Datadog/VictoriaMetrics 等兼容端点。

若上层 ExecGo 需要根据宿主能力做调度/策略决策，建议同时拉取：

- `/api/v1/runtime/info`
- `/api/v1/runtime/capabilities`
- `/api/v1/runtime/config`
- `/api/v1/runtime/resources`

建议告警：

| 信号 | 说明 |
|------|------|
| `/readyz` 非 200 | 存储不可用，任务提交和状态查询可能失败。 |
| `accepted_waiting_tasks` 持续增长 | 资源不足、租户配额不足、并发上限过低或 shim 启动异常。 |
| `reserved.task_slots == capacity.task_slots` 持续过久 | 节点长期打满，考虑扩容或提高队列可观测性。 |
| `warnings` 非空或 `degraded=true` | 宿主能力低于预期，例如 cgroup 不可写或 Linux sandbox 被禁用。 |
| `failed` 任务比例升高 | 需要结合 `error.code`、事件流和 stderr 区分用户命令失败与 runtime 问题。 |

## 容量规划

runtime 的容量控制分两层：

1. `--max-running-tasks` 控制同时运行的任务数，也是 ResourceLedger 的 `task_slots` 总容量。
2. `--capacity-memory-bytes` / `--capacity-pids` 覆盖本机容量探测，用于调度前 reservation。

任务侧通过 `limits.memory_bytes` 和 `limits.pids_max` 声明需求。若任务不声明这些字段，就不会占用对应账本科目，但仍会占用一个 `task_slots`。

租户软配额示例：

```bash
execgo-runtime serve \
  --max-running-tasks 8 \
  --capacity-memory-bytes 17179869184 \
  --capacity-pids 2048 \
  --tenant-quota alice=slots:2,memory:2147483648,pids:256 \
  --tenant-quota bob=slots:4,memory:4294967296,pids:512
```

配额语义：

- 配额只在任务设置 `control_context.tenant` 且该租户有配置时生效。
- 单任务超过租户配额会在提交时被拒绝。
- 多任务累计超过租户剩余额度时，后续任务保留在 `accepted` 等待。
- 无租户配额的任务仍可能占满节点总容量，因此控制面应避免把所有未标租户任务打到同一节点。

## Docker 示例

仓库提供 `Dockerfile`（多阶段构建），并通过 GitHub Actions 发布到 GitHub Container Registry（GHCR）。

拉取已发布镜像：

```bash
docker pull ghcr.io/iammm0/execgo-runtime:latest
docker run --rm -p 8080:8080 -v execgo-data:/data ghcr.io/iammm0/execgo-runtime:latest
```

本地快速原型用法：

```bash
docker build -t execgo-runtime:local .
docker run --rm -p 8080:8080 -v execgo-data:/data execgo-runtime:local
```

镜像入口为 `serve`，监听 `0.0.0.0:8080`，数据目录 `/data`。

生产容器建议：

- 使用命名卷或宿主目录挂载 `/data`。
- 不要把未鉴权的 8080 端口直接暴露到公网。
- 如果需要 `linux_sandbox` 或 cgroup enforcement，确认容器运行时是否允许对应 namespace/cgroup 操作；很多受限容器环境会让 runtime 自动降级。
- 对容器内运行的用户命令设置合理 `limits.wall_time_ms`，避免长时间占用 task slot。

## 安全边界

`execgo-runtime` 当前的安全模型是“可信控制面 + 受控网络 + runtime 执行治理”：

- runtime API 没有内置用户登录、token 校验或 RBAC。
- `control_context.owner` 只保护取消操作，不能替代认证。
- `linux_sandbox` 是增强隔离能力，不应被视为完整多租户安全沙箱。
- 如果执行来自不可信用户的任意代码，建议放在隔离 VM、专用容器节点或更强的 sandbox 外壳中运行。
- 建议由 ExecGo 控制面负责参数白名单、租户鉴权、审计策略和任务配额，再把已治理的请求交给 runtime。

## CI/CD

本仓库使用 **GitHub Actions**：

- **CI**（`.github/workflows/ci.yml`）：在 push / PR 上执行 `fmt`、`clippy`、`test`。
- **Container image**（`.github/workflows/container.yml`）：在 `main` / `master` 或版本标签 push 后构建 Docker 镜像并推送到 `ghcr.io/iammm0/execgo-runtime`。
- **Release 构建**（`.github/workflows/release.yml`）：在推送以数字开头的版本标签（如 `1.1.0`）时构建 Linux/macOS release 二进制并上传 Artifact。

流水线定义以仓库内 YAML 为准。

GHCR 标签策略：

- 默认分支构建：`latest`、`main`（或对应分支名）、`sha-<commit>`。
- 版本标签构建：原始 Git 标签（如 `1.1.0`）和 `sha-<commit>`。

## 版本与标签

- **Cargo 版本**：与 `Cargo.toml` 中 `version` 一致，`/healthz` 中 `version` 字段来自该值。
- **Git 标签**：发布节点可打标签（如 `1.1.0`），便于对照源码与二进制产物。

预发布版本（`-b1`、`-beta` 等）表示 API 与行为仍可能调整；升级前请阅读变更说明。

## ExecGo 环境变量

在 ExecGo 控制面配置：

```text
EXECGO_RUNTIME_URL=http://<host>:<port>
```

指向本服务根 URL（无尾部 `/` 亦可，客户端会裁剪）。
