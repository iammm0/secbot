# Docker Compose 部署示范

本页给出可直接套用的 Docker Compose 方案（基于你仓库根目录 `docker-compose.yml` 以及 `Dockerfile` 的环境变量约定）。

## 目标

- 运行 ExecGo：HTTP（`8080`）+ 可选 gRPC（`50051`）
- 把任务状态持久化到 `/data/state.json`（通过挂载实现）
- 通过 `/health` 做健康检查

## Compose 示例

```yaml
services:
  execgo:
    build:
      context: .
      dockerfile: Dockerfile
    ports:
      - "8080:8080"
      - "50051:50051"
    volumes:
      - ./data:/data
    environment:
      EXECGO_ADDR: ":8080"
      EXECGO_GRPC_ADDR: ":50051"
      EXECGO_DATA_DIR: "/data"
      EXECGO_MAX_CONCURRENCY: "10"
      EXECGO_SHUTDOWN_TIMEOUT: "15"
```

如果你已经把镜像构建并推送到了镜像仓库，也可以把 `build` 替换为 `image: xxx:tag`。

## 启动与验证

在仓库根目录执行：

```bash
mkdir -p data
docker compose up -d --build
```

验证健康检查：

```bash
curl http://localhost:8080/health
```

## 提交一个最小任务图（验证 API）

```bash
curl -X POST http://localhost:8080/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "tasks": [
      {
        "id": "hello",
        "type": "shell",
        "params": { "runner": "auto", "script": "echo hello" },
        "retry": 0,
        "timeout": 5000
      }
    ]
  }'
```

提交后用 `GET /tasks/{id}` 轮询等待最终状态。

## 常见坑

- 一定要挂载 `/data`：否则状态只会停留在容器生命周期中（重启会丢失任务状态）。
- 多副本语义：Compose 默认是单实例。若你用 Swarm 或扩展成多实例，需要进一步考虑状态持久化与覆盖风险（见 Kubernetes 文档“多副本注意事项”）。

