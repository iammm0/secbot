# Deploy with Docker Compose (Example)

This page provides a ready-to-use Docker Compose setup based on the repository root `docker-compose.yml` and the container environment variable conventions.

## Goals

- Run ExecGo with HTTP (`8080`) and optional gRPC (`50051`)
- Persist task state to `/data/state.json` via a volume mount
- Use `GET /health` for health checks

## Compose example

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

If you already built and pushed an image, you can replace `build` with `image: your-registry/execgo:tag`.

## Start & verify

Run from the repository root:

```bash
mkdir -p data
docker compose up -d --build
```

Check health:

```bash
curl http://localhost:8080/health
```

## Submit a minimal task graph (API check)

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

After submission, poll `GET /tasks/{id}` until it reaches a terminal state.

## Common pitfalls

- Always mount `/data` if you want persistence across restarts.
- Scaling to multiple instances changes the state semantics; see the Kubernetes section about replica safety.

