# Troubleshooting

## `execgocli` Not Found

Set `EXECGO_EXECGOCLI` to the absolute path of the binary or put it on `PATH` for the Secbot server process.

## Control Plane Connection Refused

Check `EXECGO_URL` and verify the ExecGo service is listening there.

## Runtime Tasks Wait Forever Or Fail Immediately

Check that:

- `EXECGO_RUNTIME_URL` points to a reachable runtime
- the ExecGo process was started with the same runtime URL
- you can complete an `os.noop` request before trying `runtime.command`

## ExecGo Returns A JSON Envelope Error

Surface the returned message directly. Common causes are:

- missing `kind`
- invalid `input` shape
- missing `program` for `runtime.command`
- unsupported action kinds

## `execute_command` Fails In ExecGo Mode

This repository's bridge does not accept `cwd` or `stdin_data` for ExecGo-routed command execution. Use `execgo_action` directly when those constraints matter.
