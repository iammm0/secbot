# Secbot API 接口文档

本文档对齐当前 `router/` 里的 FastAPI 路由实现，覆盖 REST 与 SSE 两类接口。

## 快速调试

### 启动后端

```bash
secbot server
# 或源码仓中
uv run secbot server
# 或
python -m router.main
```

默认地址：

- Base URL：`http://127.0.0.1:8000`
- Swagger UI：`http://127.0.0.1:8000/docs`
- ReDoc：`http://127.0.0.1:8000/redoc`
- 健康检查：`GET /health`

### 最小联调命令

```bash
curl http://127.0.0.1:8000/health

curl -N -X POST http://127.0.0.1:8000/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"你好","mode":"agent","agent":"secbot-cli"}'
```

## 认证与 CORS

当前实现默认：

- **未启用鉴权**
- **CORS 允许全部来源**（开发友好配置）

生产环境建议自行在反向代理或应用层补充认证、来源限制与访问控制。

## 一、聊天接口

### 1. `POST /api/chat`

SSE 流式聊天接口，走 `SessionManager` 编排流程。

请求体：

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `message` | string | 是 | 用户输入 |
| `mode` | `ask` \| `agent` | 否 | `ask` 为问答模式，`agent` 为智能体执行模式，默认 `agent` |
| `agent` | string | 否 | 智能体类型，默认 `secbot-cli` |
| `prompt` | string | 否 | 自定义系统提示词 |
| `model` | string | 否 | 模型偏好，后端可选使用 |

当前默认智能体：

- `secbot-cli`
- `superhackbot`

SSE 事件：

| 事件名 | 说明 |
|--------|------|
| `connected` | 连接建立 |
| `planning` | 规划开始 |
| `thought_start` | 推理轮次开始 |
| `thought_chunk` | 推理流式片段 |
| `thought` | 本轮推理完成 |
| `action_start` | 工具执行开始 |
| `action_result` | 工具执行结果 |
| `content` | 结构化内容输出 |
| `report` | 报告输出 |
| `phase` | 任务阶段变化 |
| `root_required` | 需要用户确认 root 权限 |
| `error` | 错误 |
| `response` | 最终完整响应 |
| `done` | 流结束 |

最小请求示例：

```bash
curl -N -X POST http://127.0.0.1:8000/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "message": "扫描本机系统信息",
    "mode": "agent",
    "agent": "secbot-cli"
  }'
```

### 2. `POST /api/chat/root-response`

当前端收到 `root_required` 事件后，用此接口回传用户选择。

请求体：

```json
{
  "request_id": "uuid-from-sse",
  "action": "run_once",
  "password": "optional-password"
}
```

`action` 可选值：

- `run_once`
- `always_allow`
- `deny`

### 3. `POST /api/chat/sync`

同步聊天接口，不返回中间 SSE 过程。

示例：

```bash
curl -X POST http://127.0.0.1:8000/api/chat/sync \
  -H "Content-Type: application/json" \
  -d '{"message":"你好","mode":"ask"}'
```

响应：

```json
{
  "response": "你好，请问需要我做什么？",
  "agent": "qa"
}
```

## 二、智能体与会话接口

### 1. `GET /api/agents`

列出可用智能体。

响应示例：

```json
{
  "agents": [
    {
      "type": "secbot-cli",
      "name": "Hackbot",
      "description": "自动模式（ReAct，基础扫描，全自动）"
    },
    {
      "type": "superhackbot",
      "name": "SuperHackbot",
      "description": "专家模式（ReAct，全工具，敏感操作需确认）"
    }
  ]
}
```

### 2. `POST /api/agents/clear`

清空指定智能体的对话记忆；不传 `agent` 时清空全部。

请求体：

```json
{
  "agent": "secbot-cli"
}
```

### 3. `GET /api/sessions`

返回会话列表。当前后端为**无状态实现**，该接口会返回空数组与说明，供 TUI 的 `/sessions` 之类命令避免 404。

## 三、系统与模型配置接口

### 1. `GET /api/system/info`

返回系统信息：

- 操作系统
- 架构
- Python 版本
- 主机名
- 用户名

### 2. `GET /api/system/status`

返回 CPU、内存、磁盘实时状态。

### 3. `GET /api/system/config`

返回当前推理后端及模型配置，例如：

```json
{
  "llm_provider": "deepseek",
  "ollama_model": "gemma3:1b",
  "ollama_base_url": "http://localhost:11434",
  "deepseek_model": "deepseek-reasoner",
  "deepseek_base_url": "https://api.deepseek.com",
  "current_provider_model": "deepseek-reasoner",
  "current_provider_base_url": null
}
```

### 4. `GET /api/system/config/provider/{provider_id}`

获取某个厂商当前保存的 `model` / `base_url`。

### 5. `GET /api/system/config/providers`

列出所有厂商的 API Key 配置状态。

### 6. `POST /api/system/config/api-key`

设置或删除某厂商 API Key，也可同时设置 Base URL。

请求体示例：

```json
{
  "provider": "deepseek",
  "api_key": "sk-xxx"
}
```

设置带 Base URL 的厂商：

```json
{
  "provider": "custom",
  "api_key": "sk-xxx",
  "base_url": "https://example.com/v1"
}
```

### 7. `POST /api/system/config/provider`

切换当前默认推理后端。

```json
{
  "llm_provider": "ollama"
}
```

### 8. `POST /api/system/config/provider-settings`

更新某厂商的默认模型或 Base URL。

```json
{
  "provider": "ollama",
  "model": "gemma3:3b"
}
```

### 9. `GET /api/system/ollama-models`

列出当前 Ollama 节点的模型列表。可选 query 参数：

- `base_url`

接口会在模型缺失时返回 `pulling_model`，用于前端展示后台拉取状态。

### 10. `GET /api/system/log-level`

获取当前日志级别。

### 11. `POST /api/system/log-level`

设置日志级别，当前仅支持：

- `DEBUG`
- `INFO`

请求体：

```json
{
  "level": "DEBUG"
}
```

## 四、防御接口

### 1. `POST /api/defense/scan`

执行完整安全扫描并返回报告。

### 2. `GET /api/defense/status`

查看防御模块状态。

### 3. `GET /api/defense/blocked`

查看被封禁 IP 列表。

### 4. `POST /api/defense/unblock`

解封指定 IP。

```json
{
  "ip": "192.168.1.10"
}
```

### 5. `GET /api/defense/report`

生成防御报告。支持 query 参数：

- `type=full`
- `type=vulnerability`
- `type=attack`

## 五、网络接口

### 1. `POST /api/network/discover`

扫描网络段，若不传 `network` 则自动探测。

```json
{
  "network": "192.168.1.0/24"
}
```

### 2. `GET /api/network/targets`

列出已发现主机。

可选 query 参数：

- `authorized_only=true|false`

### 3. `GET /api/network/authorizations`

列出当前授权记录。

### 4. `POST /api/network/authorize`

授权目标主机。

```json
{
  "target_ip": "192.168.1.10",
  "username": "root",
  "password": "secret",
  "auth_type": "full",
  "description": "测试环境授权"
}
```

### 5. `DELETE /api/network/authorize/{target_ip}`

撤销指定 IP 的授权。

## 六、数据库接口

### 1. `GET /api/db/stats`

返回数据库表统计：

- `conversations`
- `prompt_chains`
- `user_configs`
- `crawler_tasks`
- `crawler_tasks_by_status`

### 2. `GET /api/db/history`

查看对话历史。

支持 query 参数：

- `agent`
- `limit`
- `session_id`

### 3. `DELETE /api/db/history`

按筛选条件删除对话历史。

支持 query 参数：

- `agent`
- `session_id`

## 七、工具接口

### `GET /api/tools`

列出当前集成的安全工具分类、总数、基础工具与高级工具统计。

返回中包含：

- `total`
- `basic_count`
- `advanced_count`
- `categories`
- `tools`

## 八、错误格式

大多数接口错误时返回：

```json
{
  "detail": "错误说明"
}
```

如果是 SSE 流式接口，则错误会作为 `error` 事件发送。
