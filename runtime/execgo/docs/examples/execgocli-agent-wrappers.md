# Thin wrappers for Codex / Claude Code

Do **not** re-implement the HTTP protocol in each agent. Instead, wrap `execgocli` and pass JSON through.

## Common pattern

1. Point `EXECGO_URL` at your ExecGo instance.
2. Run `execgocli tools` once to cache or display the manifest.
3. For each action, build an `AgentActionRequest` JSON and pipe to `execgocli act`.
4. Poll with `execgocli wait -task-ids ...`.

## Codex (conceptual “skill” stub)

```yaml
# Pseudocode: skill definition — call the local binary
name: execgo-adapter-act
description: Submit a mature-agent action via execgocli act
command: |
  exec "${EXECGO_EXECGOCLI:-execgocli}" act
input_schema:
  type: object
  properties:
    payload_json: { type: string, description: "Full AgentActionRequest JSON" }
```

Your runner should write `payload_json` to stdin of `execgocli act` and parse stdout JSON (`ok` / `data` / `error`).

## Claude Code (conceptual tool)

```json
{
  "name": "execgo_adapter_act",
  "description": "Run execgocli act with JSON stdin; set EXECGO_URL",
  "command": ["execgocli", "act"],
  "input": { "type": "object" }
}
```

Map the agent’s structured input to `AgentActionRequest` before invoking the CLI.

## Error handling

- Always check `"ok": false` and surface `error.message` + `error.body` to the user.
- Exit code `3` on `wait` means timeout without terminal status.

## Related

- [Mode A (CLI)](../en/integration/mode-a-cli.md) (English)
- [模式 A（CLI）](../zh/integration/mode-a-cli.md) (中文)
- [execgocli contract](../en/reference/execgo-cli-contract.md)
