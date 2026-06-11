# 系统架构

## 总览

```
┌─────────────────┐     HTTP + SSE      ┌──────────────────────────────┐
│  terminal-ui    │ ◄──────────────────► │  server/ (NestJS)            │
│  Ink + React    │   POST /api/chat     │  ChatService · Tools · DB    │
└─────────────────┘                      └──────────────────────────────┘
         │                                           │
         │ secbot (spawn/service)                    ├── SQLite
         └──────────────────────────────────────────├── Vuln DB (NVD/CVE/…)
                                                     ├── Vector memory (可选)
                                                     └── LLM providers
```

## 目录结构

| 路径 | 职责 |
| --- | --- |
| `server/src/main.ts` | NestJS 启动 |
| `server/src/modules/chat/` | 会话编排、SSE、上下文组装 |
| `server/src/modules/agents/core/` | IntentRouter、Explore/ReAct/Planner/Executor/Summary |
| `server/src/modules/tools/` | 安全 / 网络 / OSINT / MCP 等工具 |
| `server/src/modules/vuln-db/` | 统一漏洞库与向量检索 |
| `terminal-ui/src/` | Ink 应用、SSE 消费、块式渲染 |
| `npm-bin/` | `secbot` / `secbot-server` / `secbot-mcp` 入口 |
| `skills/` | Agent Skills（REST / TUI / CLI 共享） |

## 设计原则

- **无 LangChain / LangGraph**：Agent 循环为手写 TypeScript
- **SSE 优先**：TUI 实时展示 thought / action / planning / report
- **上下文预算**：按模型窗口组装 prompt，TUI 底部 **ctx** 显示用量
- **Explore 只读**：探索阶段禁止 `sensitive` 工具

## 二进制入口

| 命令 | 行为 |
| --- | --- |
| `secbot` | TUI；默认 spawn 本地后端 |
| `secbot-server` | 仅 API |
| `secbot-mcp` | stdio MCP，暴露 ToolsService 目录 |

## 数据存储

- 主库：SQLite（会话、配置、历史）
- 漏洞库：NVD / CVE.org / Exploit-DB / MITRE 适配器 + 可选向量索引

## 相关页面

- [[Agent-Orchestration|智能体编排]]
- [[Terminal-UI|终端 UI]]
- [[Tools|工具模块]]
