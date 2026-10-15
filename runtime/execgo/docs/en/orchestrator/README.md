# Orchestrator：Adopting ExecGo from an Upper Layer

ExecGo runs your submitted `TaskGraph` asynchronously using a DAG scheduler.
So your orchestration layer (Agent framework / workflow engine) mainly needs to:

1. Translate your workflow DAG into an ExecGo `TaskGraph`
2. Correctly interpret ExecGo result semantics (`success/failed/skipped`)
3. Implement asynchronous polling (and, if needed, idempotent submit)

## Document entry points

- [Mapping：DAG -> TaskGraph](./mapping-dag-to-taskgraph.md)
- [Failure semantics：failed vs skipped](./failure-semantics.md)
- [Polling & idempotency：stable submit & read results](./polling-and-idempotency.md)

## Read these References first

- [`Task DSL` (task model & validation)](../reference/task-dsl.md)
- [`API endpoints` (POST /tasks and GET /tasks/{id})](../reference/api.md)

---

Reminder: `POST /tasks` returns `202 Accepted` immediately. You must poll `GET /tasks/{id}` to obtain final states.

