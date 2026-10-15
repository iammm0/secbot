# 本地开发

## 前置条件

- 安装 **Rust**（`rustup` 推荐，`stable` 工具链）。
- macOS / Linux 开发体验最佳；Windows 未列为一级支持。

## 常用命令

```bash
# 格式化
cargo fmt

# 静态检查
cargo clippy --all-targets --all-features

# 测试（含集成测试 e2e）
cargo test

# CI 等价静态检查
cargo clippy --all-targets --all-features -- -D warnings

# 运行服务
cargo run -- serve --listen-addr 127.0.0.1:8080 --data-dir ./data
```

集成测试位于 `tests/e2e.rs`，会启动真实子进程并访问 HTTP 端口。当前 e2e 覆盖：

- 任务提交、执行、artifact 持久化与事件流。
- CLI `submit` / `kill` / `run` 主流程。
- runtime info/capabilities/config/resources 自描述接口。
- adaptive execution plan 可见性与 strict capability 拒绝。
- 租户配额超限时的 `insufficient_resources`。
- owner-gated kill 的 HTTP 403 与 CLI `--owner` / `EXECGO_RUNTIME_OWNER`。

## 目录结构（简要）

```text
src/
  main.rs       # 二进制入口
  lib.rs        # 库入口与模块声明
  cli.rs        # 命令行
  server.rs     # HTTP 路由
  runtime.rs    # 核心运行时
  capabilities.rs # 宿主能力探测与 capability manifest
  policy.rs     # requested/effective execution plan 解析
  ledger.rs     # 本机 ResourceLedger 计算
  repo.rs       # SQLite
  types.rs      # 数据模型
  metrics.rs    # Prometheus 文本
  error.rs      # 错误与 HTTP 映射
tests/
  e2e.rs        # 端到端测试
```

## 本地调试工作流

建议使用两个终端：

```bash
# 终端 1：前台启动 runtime，禁用 Linux-only 能力，便于 macOS/Linux 一致调试
RUST_LOG=debug cargo run -- serve \
  --listen-addr 127.0.0.1:8080 \
  --data-dir ./data-dev \
  --disable-linux-sandbox \
  --disable-cgroup \
  --tenant-quota alice=slots:2,memory:1073741824,pids:128

# 终端 2：提交任务
cargo run -- run --json '{
  "execution": {
    "kind": "command",
    "program": "/bin/sh",
    "args": ["-c", "echo debug && sleep 1"]
  },
  "control_context": {
    "tenant": "alice",
    "owner": "alice"
  }
}'
```

排障顺序：

1. `GET /api/v1/runtime/capabilities`：确认宿主能力和降级告警。
2. `GET /api/v1/runtime/resources`：确认总容量、活动 reservation、租户额度。
3. `GET /api/v1/tasks/<task_id>/events`：确认任务停在 submitted/planned/resource_reserved/started/finished 的哪一步。
4. 查看 `data-dev/tasks/<task_id>/stderr.log` 和 `result.json`。
5. 若任务停在 `accepted`，检查资源是否不足、租户配额是否打满、`--max-running-tasks` 是否过低。

## 代码风格

- 与现有代码保持一致：错误用 `AppError` / `AppResult`，异步边界用 `tokio`。
- 提交前建议执行 `cargo fmt` 与 `cargo clippy`，与 CI 保持一致。
- 新增用户可见字段或接口时，需同步更新 `README.md`、`docs/api.md`、`docs/architecture.md` 与本索引。
- 与 capability/policy/ledger 相关的行为必须保留向后兼容：旧 `SubmitTaskRequest` 不传 `policy` / `control_context` 时仍应可运行。

## API 变更清单

修改对外契约时，请按这个清单核对：

| 变更类型 | 需要同步 |
|----------|----------|
| 新增请求字段 | `types.rs` 校验、`docs/api.md` 字段表、至少一个 e2e 或单元测试。 |
| 新增响应字段 | `TaskStatusResponse`/runtime 自描述结构、API 文档、网站镜像文档。 |
| 新增 CLI 参数 | `cli.rs`、`docs/cli.md`、`README.md` 快速说明、必要时 e2e。 |
| capability/policy 行为变化 | `capabilities.rs`、`policy.rs`、`docs/architecture.md`、strict/adaptive 测试。 |
| ResourceLedger 行为变化 | `ledger.rs` 单元测试、`runtime_resources` e2e、部署/容量规划文档。 |
| 错误码或 HTTP 映射变化 | `error.rs`、`docs/api.md`、调用方兼容说明。 |

## 文档同步

本仓库文档是 runtime 源文档；发布网站在独立仓库维护一份镜像：

```text
execgo-publish-website/content/execgo-runtime/docs/zh/
```

改动 runtime 文档后，需要把 `docs/*.md` 同步到网站镜像目录，并运行网站侧校验（至少 `npm run lint`，条件允许时 `npm run build`）。这是为了保证 GitHub 仓库和网站 `/docs/runtime` 内容一致。

## 兼容性约束

- `SubmitTaskRequest` 的老字段默认值必须继续可用：不传 `limits`、`sandbox`、`policy`、`control_context` 时应能执行最小 command。
- 新增字段优先使用 `Option<T>` 或合理默认值，避免破坏已有 JSON。
- `TaskStatus`、`ErrorCode` 和 endpoint 路径是外部调用方最敏感的契约，改名或删除前需要迁移策略。
- macOS 与 Linux 都是开发/CI 目标；Linux-only 能力必须能在 macOS 上以 capability 降级或禁用方式通过。
- Windows 不是目标平台，代码可依赖 Unix 进程、信号、`wait4` 等语义。

## 贡献流程

1. Fork 仓库并创建分支。
2. 小步提交，说明清楚**动机与行为变化**。
3. 推送并发起 Pull Request；确保 CI 通过。

若需新增面向用户的文档，请同步更新 `docs/README.md` 索引与根 `README.md` 链接。
