# Monorepo 迁移指南

## 目录结构

```
secbot/
├── apps/
│   ├── secbot-api/          # FastAPI 路由与会话入口 (原 router/)
│   │   └── router/
│   ├── secbot-cli/          # CLI/TUI 入口 (原 secbot_cli/)
│   │   └── secbot_cli/
│   └── opencode-gateway/    # ACP 协议网关 (新建)
│       └── opencode_gateway/
├── packages/
│   ├── secbot-core/         # Agent 编排核心
│   │   ├── core/            # 原 core/
│   │   ├── prompts/         # 原 prompts/
│   │   ├── utils/           # 原 utils/
│   │   ├── database/        # 原 database/
│   │   └── controller/      # 原 controller/
│   ├── secbot-tools/        # 工具与系统操作
│   │   ├── tools/           # 原 tools/
│   │   ├── system/          # 原 system/
│   │   ├── defense/         # 原 defense/
│   │   ├── crawler/         # 原 crawler/
│   │   ├── payloads/        # 原 payloads/
│   │   └── scanner/         # 原 scanner/
│   ├── secbot-skills/       # 技能系统 (原 skills/)
│   │   └── skills/
│   ├── shared-config/       # 统一配置
│   │   └── hackbot_config/  # 原 hackbot_config/
│   └── opencode-adapters/   # opencode 兼容适配器 (新建)
│       └── opencode_adapters/
├── tests/                   # 测试
├── docs/                    # 文档
├── main.py                  # 入口 (已更新 sys.path)
├── conftest.py              # pytest 路径配置 (新建)
└── pyproject.toml           # 已更新 find.where
```

## 导入兼容性

所有 Python 包名保持不变（如 `from core.session import SessionManager`），
通过 `pyproject.toml` 的 `[tool.setuptools.packages.find] where` 配置
和 `conftest.py` / `main.py` 中的 `sys.path` 注入保证兼容。

## 启动方式

### 原有命令（不变）

```bash
# 后端
secbot-server
# 或
python main.py --backend

# CLI
secbot-cli

# TUI（后端 + TUI）
python main.py
```

### 新增命令

```bash
# ACP 网关（通过 stdio 提供 ACP 协议接口）
python -m opencode_gateway.main
```

## 新增组件

### 1. ACP 网关 (`apps/opencode-gateway`)

基于 ND-JSON 的 ACP 协议服务端实现，允许 ACP 兼容客户端（如 opencode、Cursor）
与 secbot Agent 通信。

**关键模块：**
- `protocol.py` — JSON-RPC 2.0 over ND-JSON 传输层
- `agent.py` — ACP Agent，桥接协议方法到 `SessionManager`
- `event_mapper.py` — secbot EventBus → ACP sessionUpdate 事件映射
- `session.py` — ACP 会话状态管理

**协议方法支持：**
- `initialize` — 能力协商
- `session/new` / `session/load` — 会话管理
- `session/prompt` — 消息处理
- `session/setMode` — 模式切换（agent/plan/ask）
- `session/cancel` — 取消执行
- `mcp/status` / `mcp/add` — MCP 服务器管理

### 2. opencode 适配器 (`packages/opencode-adapters`)

**计划模式 (`plan_mode.py`)：**
- `PlanModeController` — 管理 agent/plan/ask 模式切换与工具过滤

**权限系统 (`permissions.py`)：**
- `PermissionManager` — allow/ask/deny 策略管理
- 按工具类别（edit/execute/read/network）自动分类

**编辑工具 (`edit_tools.py`)：**
- `EditFileTool` — diff 替换（对齐 opencode EditTool 语义）
- `WriteFileTool` — 整文件写入

**MCP 客户端 (`mcp_client.py`)：**
- `MCPManager` — MCP 服务器生命周期管理
- `MCPConnection` — 本地 (stdio) / 远端 (HTTP) 连接
- `MCPToolWrapper` — MCP 工具 → secbot `BaseTool` 转换

**统一技能 (`unified_skills.py`)：**
- `UnifiedSkillLoader` — 合并 secbot + opencode 技能发现源
- `UnifiedSkillInjector` — 自动注入 + 显式加载双路径
- `SkillTool` — opencode 风格的 skill 工具

### 3. 配置扩展 (`packages/shared-config`)

**MCP 配置 (`mcp_config.py`)：**
- 从 `opencode.json(c)` 读取 MCP 服务器定义
- 支持项目级和全局配置

**特性开关 (`feature_flags.py`)：**
- 环境变量控制各集成能力的启用/禁用
- 默认全部关闭，可灰度启用

## 特性开关

| 环境变量 | 功能 | 默认 |
|---|---|---|
| `SECBOT_ACP_ENABLED` | ACP 网关 | off |
| `SECBOT_MCP_ENABLED` | MCP 工具集成 | off |
| `SECBOT_UNIFIED_SKILLS` | 统一技能层 | off |
| `SECBOT_EDIT_TOOLS` | opencode 风格编辑工具 | off |
| `SECBOT_PLAN_MODE` | 计划模式支持 | off |
| `SECBOT_PERMISSIONS` | 权限系统 | off |

全部启用：

```bash
export SECBOT_ACP_ENABLED=true
export SECBOT_MCP_ENABLED=true
export SECBOT_UNIFIED_SKILLS=true
export SECBOT_EDIT_TOOLS=true
export SECBOT_PLAN_MODE=true
export SECBOT_PERMISSIONS=true
```

## MCP 服务器配置

在项目根目录创建 `opencode.json`：

```json
{
  "mcp": {
    "my-local-server": {
      "type": "local",
      "command": ["node", "path/to/server.js"],
      "environment": { "API_KEY": "xxx" }
    },
    "my-remote-server": {
      "type": "remote",
      "url": "https://mcp.example.com/api",
      "headers": { "Authorization": "Bearer xxx" }
    }
  }
}
```

也可通过环境变量 `SECBOT_MCP_CONFIG` 传入 JSON 字符串。

## 测试

```bash
# 运行全部集成测试
python -m pytest tests/test_monorepo_integration.py -v

# 运行原有测试
python -m pytest tests/ -v
```

## 回退

如需回退到旧结构，可通过 git 还原目录移动。
当前仓库保留 opencode 兼容能力（协议/配置/工具语义），但不再内置上游 opencode TS 工作区。
所有 Python 包名未改变，仅物理位置发生了变化。
