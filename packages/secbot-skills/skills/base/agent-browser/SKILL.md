---
name: agent-browser
description: >
  Browser automation skill based on agent-browser CLI for web navigation, form interaction,
  snapshots, extraction and screenshot workflows.
version: "1.0.0"
author: "Secbot Team"
tags: ["browser", "web", "automation", "agent-browser", "playwright"]
triggers: ["agent-browser", "browser", "网页", "页面", "自动化", "screenshot", "snapshot", "click", "fill", "extract"]
prerequisites: []
---

# agent-browser

Use `agent-browser` as the default browser automation CLI for structured web interaction in authorized testing.

## Pre-check

1. Confirm CLI is available:
   - `agent-browser --version`
2. If missing:
   - `npm install -g agent-browser`
   - `agent-browser install`

If `agent-browser install` fails due to network, continue with system Chrome:
- `agent-browser --executable-path "C:\Program Files\Google\Chrome\Application\chrome.exe" ...`

## Standard flow

1. Open target:
   - `agent-browser open https://example.com`
2. Wait for page:
   - `agent-browser wait --load networkidle`
3. Snapshot:
   - `agent-browser snapshot -i`
4. Interact:
   - `agent-browser click @e2`
   - `agent-browser fill @e3 "value"`
5. Extract:
   - `agent-browser get text @e1`
6. Save evidence:
   - `agent-browser screenshot artifacts/page.png`

## Safety

- Only use on authorized targets.
- Avoid submitting destructive actions unless explicitly requested.
