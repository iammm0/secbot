# Hackbot API 接口文档

## 概述

Hackbot 提供基于 FastAPI 的 RESTful API 接口，支持同步请求和 Server-Sent Events (SSE) 流式响应。所有接口均以 `/api/` 为前缀，采用 JSON 格式进行数据交换。

**Base URL**: `http://localhost:8000` (开发环境)

**文档地址**:
- Swagger UI: `http://localhost:8000/docs`
- ReDoc: `http://localhost:8000/redoc`

## 认证与跨域

当前版本所有接口均为公开访问，CORS 已配置允许所有来源（开发环境）。生产环境建议配置认证中间件。

## 接口列表

### 1. 健康检查

**端点**: `GET /health`

检查服务是否正常运行。

**响应示例**:
```json
{
  "status": "ok"
}
```

---

### 2. 聊天接口

#### 2.1 流式聊天 (SSE)

**端点**: `POST /api/chat`

使用 SSE 进行流式输出，实时返回推理过程和执行结果。

**请求参数**:

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| message | string | 是 | 用户消息 |
| mode | string | 否 | 模式: `ask`(仅提问), `plan`(编写计划), `agent`(执行智能体)，默认 `agent` |
| agent | string | 否 | 智能体类型: `hackbot`(自动模式), `superhackbot`(专家模式)，默认 `hackbot` |
| prompt | string | 否 | 自定义系统提示词 |
| model | string | 否 | 模型偏好 |

**SSE 事件类型**:

| 事件类型 | 说明 |
|----------|------|
| connected | 连接建立 |
| planning | 规划阶段开始 |
| thought_start | 推理开始 |
| thought_chunk | 推理内容（流式） |
| thought_end | 推理完成 |
| action_start | 工具执行开始 |
| action_result | 工具执行结果 |
| content | 内容输出 |
| report | 报告生成 |
| phase | 任务阶段状态 |
| response | 最终完整响应 |
| done | 流式结束 |
| error | 错误发生 |

**请求示例**:
```bash
curl -X POST "http://localhost:8000/api/chat" \
  -H "Content-Type: application/json" \
  -d '{"message": "扫描内网主机", "mode": "agent"}'
```

#### 2.2 同步聊天

**端点**: `POST /api/chat/sync`

同步获取聊天响应，不返回执行过程。

**响应示例**:
```json
{
  "response": "已完成内网扫描，发现 5 台主机...",
  "agent": "hackbot"
}
```

---

### 3. 智能体管理

#### 3.1 列出所有智能体

**端点**: `GET /api/agents`

**响应示例**:
```json
{
  "agents": [
    {
      "type": "hackbot",
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

#### 3.2 清空对话记忆

**端点**: `POST /api/agents/clear`

**请求参数**:

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| agent | string | 否 | 智能体类型，不指定则清空所有 |

**响应示例**:
```json
{
  "success": true,
  "message": "已清空智能体 'hackbot' 的记忆"
}
```

---

### 4. 系统信息

#### 4.1 获取系统信息

**端点**: `GET /api/system/info`

获取操作系统、架构、Python 版本等基本信息。

**响应示例**:
```json
{
  "os_type": "Darwin",
  "os_name": "macOS",
  "os_version": "14.0",
  "os_release": "23A344",
  "architecture": "arm64",
  "processor": "Apple M1 Pro",
  "python_version": "3.12.0",
  "hostname": "macbook.local",
  "username": "iammm"
}
```

#### 4.2 获取系统状态

**端点**: `GET /api/system/status`

获取 CPU、内存、磁盘实时状态。

**响应示例**:
```json
{
  "cpu": {
    "count": 10,
    "percent": 45.5,
    "freq_current": 3200.0
  },
  "memory": {
    "total_gb": 16.0,
    "used_gb": 8.5,
    "available_gb": 7.5,
    "percent": 53.1
  },
  "disks": [
    {
      "device": "/dev/disk1s5",
      "mountpoint": "/",
      "total_gb": 512.0,
      "used_gb": 256.0,
      "percent": 50.0
    }
  ]
}
```

---

### 5. 防御系统

#### 5.1 执行安全扫描

**端点**: `POST /api/defense/scan`

执行完整的安全扫描，返回扫描报告。

**响应示例**:
```json
{
  "success": true,
  "report": {
    "vulnerabilities": [],
    "scan_time": "2024-01-01 12:00:00"
  }
}
```

#### 5.2 获取防御状态

**端点**: `GET /api/defense/status`

**响应示例**:
```json
{
  "monitoring": true,
  "auto_response": false,
  "blocked_ips": 3,
  "vulnerabilities": 0,
  "detected_attacks": 5,
  "malicious_ips": 2,
  "statistics": {}
}
```

#### 5.3 获取封禁IP列表

**端点**: `GET /api/defense/blocked`

**响应示例**:
```json
{
  "blocked_ips": ["192.168.1.100", "10.0.0.50"]
}
```

#### 5.4 解封IP

**端点**: `POST /api/defense/unblock`

**请求参数**:

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| ip | string | 是 | 要解封的 IP 地址 |

**响应示例**:
```json
{
  "success": true,
  "message": "已解封 IP: 192.168.1.100"
}
```

#### 5.5 生成防御报告

**端点**: `GET /api/defense/report`

**查询参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| type | string | 否 | 报告类型: `vulnerability`, `attack`，默认 `vulnerability` |

**响应示例**:
```json
{
  "success": true,
  "report": {
    "type": "vulnerability",
    "findings": []
  }
}
```

---

### 6. 网络管理

#### 6.1 内网发现

**端点**: `POST /api/network/discover`

发现内网中所有在线主机。

**请求参数**:

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| network | string | 否 | 网络段 (如 192.168.1.0/24)，默认自动检测 |

**响应示例**:
```json
{
  "success": true,
  "hosts": [
    {
      "ip": "192.168.1.10",
      "hostname": "web-server",
      "mac_address": "aa:bb:cc:dd:ee:ff",
      "open_ports": [22, 80, 443],
      "authorized": true
    }
  ]
}
```

#### 6.2 列出目标主机

**端点**: `GET /api/network/targets`

**查询参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| authorized_only | boolean | 否 | 仅显示已授权的目标 |

**响应示例**: 同 6.1

#### 6.3 授权目标

**端点**: `POST /api/network/authorize`

**请求参数**:

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| target_ip | string | 是 | 目标 IP 地址 |
| username | string | 是 | 用户名 |
| password | string | 否 | 密码 |
| key_file | string | 否 | SSH 密钥文件路径 |
| auth_type | string | 否 | 授权类型: `full`, `limited`, `read_only`，默认 `full` |
| description | string | 否 | 描述 |

**响应示例**:
```json
{
  "success": true,
  "message": "已授权目标: 192.168.1.10"
}
```

#### 6.4 列出所有授权

**端点**: `GET /api/network/authorizations`

**响应示例**:
```json
{
  "authorizations": [
    {
      "target_ip": "192.168.1.10",
      "auth_type": "full",
      "username": "admin",
      "created_at": "2024-01-01 12:00:00",
      "description": "Web 服务器"
    }
  ]
}
```

#### 6.5 撤销授权

**端点**: `DELETE /api/network/authorize/{target_ip}`

**响应示例**:
```json
{
  "success": true,
  "message": "已撤销授权: 192.168.1.10"
}
```

---

### 7. 数据库管理

#### 7.1 数据库统计

**端点**: `GET /api/db/stats`

**响应示例**:
```json
{
  "conversations": 150,
  "prompt_chains": 20,
  "user_configs": 10,
  "crawler_tasks": 5,
  "crawler_tasks_by_status": {
    "pending": 2,
    "running": 1,
    "completed": 2
  }
}
```

#### 7.2 获取对话历史

**端点**: `GET /api/db/history`

**查询参数**:

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| agent | string | 否 | 智能体类型 |
| limit | number | 否 | 返回数量，默认 10，最大 100 |
| session_id | string | 否 | 会话 ID |

**响应示例**:
```json
{
  "conversations": [
    {
      "timestamp": "2024-01-01 12:00:00",
      "agent_type": "hackbot",
      "user_message": "扫描内网",
      "assistant_message": "已完成扫描..."
    }
  ]
}
```

#### 7.3 清空对话历史

**端点**: `DELETE /api/db/history`

**查询参数**: 同 7.2

**响应示例**:
```json
{
  "success": true,
  "deleted_count": 50,
  "message": "已删除 50 条对话记录"
}
```

---

## 错误处理

所有接口使用 HTTP 状态码表示结果：

| 状态码 | 说明 |
|--------|------|
| 200 | 成功 |
| 400 | 请求参数错误 |
| 500 | 服务器内部错误 |

错误响应格式:
```json
{
  "detail": "错误描述信息"
}
```

---

## SSE 客户端示例

```typescript
import { connectSSE } from './api/sse';

const controller = connectSSE('/api/chat', {
  message: '扫描内网主机',
  mode: 'agent'
}, {
  onEvent: (event) => {
    console.log(`[${event.event}]`, event.data);
  },
  onError: (error) => {
    console.error('SSE Error:', error);
  },
  onDone: () => {
    console.log('Stream completed');
  }
});

// 取消请求
// controller.abort();
```
