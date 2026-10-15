# Mode B upgrade path (translate + TaskGraph)

Mode B is for teams that want **raw TaskGraph** or **translation without execution** before adopting full Mode A in all environments.

## Path 1: `translate` only

Use `POST /adapters/translate` (or `execgocli translate`) to obtain `task_graph` + `translation_trace` without submitting.

```bash
./execgocli translate -file request.json
```

## Path 2: `POST /tasks` (direct graph)

After review, submit a graph with `POST /tasks` (or `execgocli submit`).

```bash
./execgocli submit -file taskgraph.json
```

The JSON must be a valid `TaskGraph` (see [Task DSL](../reference/task-dsl.md)).

## Path 3: `task_graph.submit` from Mode A

The adapter can also submit a prebuilt graph through action kind `task_graph.submit` (still Mode A envelope, but graph content is under your control).

## Compatibility

- `POST /tasks` remains the low-level, stable direct submission path.
- `adapter.v1` is unchanged; see [execgocli contract](../reference/execgo-cli-contract.md).

## Future (optional)

- Batched `POST /adapters/actions:batch` may reduce round-trips; not required for current adoption.

## Related

- [Mode A (CLI quick start)](mode-a-cli.md)
- [Mature agent adapter](agent-adapter.md)
