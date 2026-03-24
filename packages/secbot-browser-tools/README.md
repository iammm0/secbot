# secbot-browser-tools

Node/TypeScript subprocess package used by Secbot to bridge browser automation
actions to the `agent-browser` CLI.

## Features

- stdio JSON-RPC server for Python caller
- Provider backed by `agent-browser` CLI
- Actions: `browser_open`, `browser_snapshot`, `browser_click`,
  `browser_fill`, `browser_get`, `browser_screenshot`

## Development

```bash
cd packages/secbot-browser-tools
npm install
npm run build
node dist/server.js
```

## Python side override

Set command for Python adapter:

```bash
export SECBOT_BROWSER_TOOLS_CMD="node packages/secbot-browser-tools/dist/server.js"
```

PowerShell:

```powershell
$env:SECBOT_BROWSER_TOOLS_CMD = "node packages/secbot-browser-tools/dist/server.js"
```
