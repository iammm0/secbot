# Secbot API 接口文档

本文档对齐当前 `server/src/modules/` 中实际注册的 NestJS 路由。所有接口默认挂在本地后端：

```text
http://127.0.0.1:8000
```

健康检查：

```bash
curl http://127.0.0.1:8000/health
```

当前后端没有启用 Swagger UI，也没有显式启用 CORS。生产或浏览器前端场景请在反向代理或应用层补充认证、访问控制与 CORS 策略。

## 1. 聊天

### `POST /api/chat`

SSE 流式聊天接口。

```bash
curl -N -X POST http://127.0.0.1:8000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"扫描本机系统信息","mode":"agent","agent":"hackbot"}'
```

请求体：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `message` | string | 是 | 用户输入 |
| `session_id` | string | 否 | 会话 ID，不传则使用 `default` |
| `mode` | `ask` / `agent` | 否 | `ask` 为问答模式，`agent` 为执行模式，默认 `agent` |
| `agent` | string | 否 | 推荐 `hackbot` 或 `superhackbot`，默认 `hackbot` |
| `prompt` | string | 否 | 自定义提示词，当前后端保留字段 |
| `model` | string | 否 | 模型偏好，当前后端保留字段 |
| `client_shell` | object | 否 | 客户端终端环境信息 |

TUI 中的 `secbot-cli` 是历史兼容别名；后端实际执行会落到 `hackbot`。

常见 SSE 事件：

| 事件 | 说明 |
|------|------|
| `connected` | 流已建立 |
| `context_debug` | 上下文调试信息，仅 `SECBOT_CONTEXT_DEBUG=1` 时发送 |
| `phase` | 阶段变化 |
| `planning` | 规划与 Todo |
| `thought_start` | 推理轮次开始 |
| `thought` | 推理轮次完成 |
| `action_start` | 工具执行开始 |
| `action_result` | 工具执行结果 |
| `content` | 文本或结构化内容 |
| `report` | 安全报告 |
| `response` | 最终回复 |
| `error` | 错误 |
| `done` | 流结束 |

### `POST /api/chat/sync`

同步聊天接口，不返回中间 SSE 过程。

```bash
curl -X POST http://127.0.0.1:8000/api/chat/sync \
  -H "Content-Type: application/json" \
  -d '{"message":"你好","mode":"ask","agent":"hackbot"}'
```

响应示例：

```json
{
  "response": "你好，请问需要我做什么？",
  "agent": "hackbot"
}
```

### `POST /api/chat/root-response`

敏感操作确认回调。字段名使用 camelCase。

```json
{
  "requestId": "request-id-from-sse",
  "action": "run_once",
  "password": "optional-password"
}
```

`action` 可选：

- `run_once`
- `always_allow`
- `deny`

## 2. 智能体

### `GET /api/agents`

列出当前后端注册的智能体。

```bash
curl http://127.0.0.1:8000/api/agents
```

当前返回的核心类型：

- `hackbot`
- `superhackbot`

### `POST /api/agents/clear`

清空智能体内存；不传 `agent` 时清空全部。

```json
{
  "agent": "hackbot"
}
```

## 3. 系统与模型配置

### `GET /api/system/info`

返回操作系统、架构、Node.js 版本、主机名与用户名。

### `GET /api/system/status`

返回 CPU、内存与磁盘状态。当前磁盘列表为占位空数组。

### `GET /api/system/config`

返回当前 LLM 配置。

### `GET /api/system/config/providers`

返回 provider 注册表及 API Key / Base URL 配置状态。

### `GET /api/system/config/provider/:providerId`

返回指定 provider 的模型与 Base URL。

### `POST /api/system/config/provider`

切换默认推理后端。

```json
{
  "llm_provider": "ollama"
}
```

### `POST /api/system/config/provider-settings`

更新某个 provider 的默认模型或 Base URL。

```json
{
  "provider": "ollama",
  "model": "llama3.2"
}
```

```json
{
  "provider": "custom",
  "base_url": "https://example.com"
}
```

### `POST /api/system/config/api-key`

设置或删除 API Key，也可单独更新 Base URL。

```json
{
  "provider": "deepseek",
  "apiKey": "sk-xxx"
}
```

如果请求体带 `baseUrl` 字段，则当前实现只处理 Base URL：

```json
{
  "provider": "custom",
  "apiKey": "",
  "baseUrl": "https://example.com"
}
```

### `GET /api/system/ollama-models`

保留兼容接口。当前实现不实际访问 Ollama，会返回空模型列表和说明文本；真实模型调用由 `OllamaProvider` 通过 Ollama `/api/chat` 执行。

## 4. 工具

### `GET /api/tools`

列出当前注册的工具分类与总数。

### `POST /api/tools/execute`

直接执行指定工具。

```bash
curl -X POST http://127.0.0.1:8000/api/tools/execute \
  -H "Content-Type: application/json" \
  -d '{"tool":"system_info","params":{}}'
```

请求体：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `tool` | string | 是 | 工具名 |
| `params` | object | 否 | 工具参数 |

## 5. 数据库

### `GET /api/db/stats`

返回：

- `conversations`
- `promptChains`
- `userConfigs`
- `crawlerTasks`
- `crawlerTasksByStatus`

### `GET /api/db/history`

查询对话历史。

Query 参数：

| 参数 | 说明 |
|------|------|
| `agent` | 按智能体类型过滤 |
| `sessionId` | 按会话 ID 过滤 |
| `limit` | 1 到 100，默认 10 |

### `DELETE /api/db/history`

按筛选条件删除对话历史。支持 `agent` 和 `sessionId`。

## 6. 记忆

### `POST /api/memory/remember`

写入记忆。

### `GET /api/memory/recall`

按 query 和 type 回忆记忆。

### `GET /api/memory/context`

获取智能体上下文文本。

### `GET /api/memory/list`

列出记忆。

### `POST /api/memory/distill`

从对话摘要提炼情景记忆。

### `POST /api/memory/episode`

写入情景记忆。

### `POST /api/memory/knowledge`

写入长期知识。

### `POST /api/memory/clear`

清理记忆。

### `GET /api/memory/stats`

返回短期、情景、长期记忆数量。

### `POST /api/memory/vector/add`

写入向量记忆。

### `POST /api/memory/vector/search`

向量检索。

### `GET /api/memory/vector/stats`

向量存储统计。

## 7. 网络与会话

### 网络接口

- `POST /api/network/discover`
- `GET /api/network/targets`
- `POST /api/network/authorize`
- `GET /api/network/authorizations`
- `GET /api/network/authorized-targets`
- `DELETE /api/network/authorize/:targetIp`
- `POST /api/network/connect`
- `POST /api/network/execute`
- `POST /api/network/upload`
- `POST /api/network/download`
- `POST /api/network/disconnect`
- `GET /api/network/control/sessions`

### 会话接口

- `GET /api/sessions`
- `GET /api/sessions/target/:targetIp`
- `GET /api/sessions/:sessionId`
- `POST /api/sessions`
- `POST /api/sessions/:sessionId/commands`
- `POST /api/sessions/:sessionId/files`
- `POST /api/sessions/:sessionId/close`

## 8. 防御

- `POST /api/defense/scan`
- `GET /api/defense/status`
- `GET /api/defense/blocked`
- `POST /api/defense/unblock`
- `GET /api/defense/report`

## 9. 爬虫

- `POST /api/crawler/tasks`
- `GET /api/crawler/tasks`
- `GET /api/crawler/tasks/:taskId`
- `GET /api/crawler/tasks/:taskId/status`
- `POST /api/crawler/tasks/:taskId/execute`
- `POST /api/crawler/tasks/:taskId/execute-async`
- `POST /api/crawler/tasks/:taskId/cancel`
- `POST /api/crawler/batch`
- `POST /api/crawler/monitors`
- `GET /api/crawler/monitors`
- `POST /api/crawler/monitors/:monitorId/check`
- `POST /api/crawler/monitors/check-all`
- `POST /api/crawler/monitors/start`
- `POST /api/crawler/monitors/stop`
- `POST /api/crawler/monitors/:monitorId/remove`

## 10. 漏洞数据库

- `GET /api/vuln-db/cve/:cveId`
- `POST /api/vuln-db/search`
- `POST /api/vuln-db/scan-match`
- `POST /api/vuln-db/sync`
- `POST /api/vuln-db/clear`
- `GET /api/vuln-db/stats`

## 11. 错误格式

普通 REST 错误会经过 `HttpExceptionFilter` 归一化。SSE 流中的错误会以 `error` 事件发送，并随后发送 `done`。
