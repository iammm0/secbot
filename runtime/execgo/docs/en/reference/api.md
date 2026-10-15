# API Reference (Index)

ExecGo exposes a small HTTP API for task submission and task lifecycle management:

- `POST /tasks`: submit a `TaskGraph` for async execution
- `GET /adapters/capabilities`: discover the mature-agent adapter contract
- `GET /adapters/tools`: discover adapter action tools for mature agents
- `POST /adapters/translate`: translate a structured action without submitting it
- `POST /adapters/actions`: translate and submit a structured action
- `GET /tasks/{id}`: fetch a single task state (`pending/running/success/failed/skipped`) plus `result` / `error`
- `GET /tasks`: list all tasks
- `DELETE /tasks/{id}`: delete a task from the state store
- `GET /health`: service health
- `GET /metrics`: basic execution metrics

## Full details

- [`API 参考`](../../zh/reference/API%20参考/API%20参考.md) (Chinese full text)
- [Mature agent adapter integration](../integration/agent-adapter.md)

If you prefer English-only reading, use this index together with the example sections in the orchestration and integration guides.

## Common requests

### Submit a task graph (DAG)

```bash
curl -X POST http://localhost:8080/tasks \
  -H "Content-Type: application/json" \
  -d '{
    "tasks": [
      {
        "id": "fetch-data",
        "type": "http",
        "params": { "url": "https://httpbin.org/json", "method": "GET" },
        "timeout": 10000
      },
      {
        "id": "save-result",
        "type": "file",
        "params": { "action": "write", "path": "output.txt", "content": "fetched!" },
        "depends_on": ["fetch-data"]
      }
    ]
  }'
```

### Poll task status

```bash
curl http://localhost:8080/tasks/fetch-data
```
