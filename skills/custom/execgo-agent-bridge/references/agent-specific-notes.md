# Agent-Specific Notes

This repository already includes a local ExecGo bridge in [execgo-action.tool.ts](/Users/zhuanzmima0000/PersonalProjects/secbot/server/src/modules/tools/control/execgo-action.tool.ts:20) and [execute-command.tool.ts](/Users/zhuanzmima0000/PersonalProjects/secbot/server/src/modules/tools/control/execute-command.tool.ts:19).

## Secbot Adaptation

- Upstream guidance assumes direct `execgocli` execution.
- In Secbot skills, prefer tool invocations so the action stays inside the server's tool framework.
- `execgo_action` is the general bridge.
- `execute_command` with `execgo=true` is the shortest path for simple shell commands.

## What Changed From Upstream

- The main `SKILL.md` is rewritten around Secbot tool names.
- Example payloads use `adapter: secbot` instead of a host-specific external agent label.
- The reference material is retained so users can still align behavior with upstream ExecGo concepts.
