# Action Contract

In Secbot, use the `execgo_action` tool instead of calling `execgocli` directly from the skill.

## Tool Parameters

- `mode`: `health`, `tools`, or omitted for action submission.
- `kind`: action kind such as `os.noop`, `runtime.command`, `runtime.script`, `mcp.call`, `cli.run`, or `task_graph.submit`.
- `action_id`: stable action identifier.
- `input`: JSON object forwarded as `action.input`.
- `wait`: defaults to `true`; set `false` if only acceptance is needed.
- `timeout_ms`: timeout for the bridge call.
- `action_timeout_ms`: optional timeout written into the action payload.
- `agent_id`, `session_id`, `adapter`, `metadata`: optional correlation fields.

## Envelope Behavior

The bridge converts parameters into an `ExecGoActionRequest` and returns either:

```json
{ "success": true, "result": { "action_id": "...", "waited": true } }
```

or a failed tool result with an error message derived from ExecGo's JSON envelope.

## Supported Action Kinds

- `os.noop`
- `os.shell`
- `os.file`
- `os.http`
- `os.dns`
- `os.tcp`
- `os.sleep`
- `runtime.command`
- `runtime.script`
- `mcp.call`
- `cli.run`
- `task_graph.submit`

Alias normalization, if any, is handled by ExecGo rather than this skill.
