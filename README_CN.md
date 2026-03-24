# Secbot Monorepo（中文）

<div align="center">

![secbot 主界面](assets/secbot-main.png)

**面向安全自动化的 AI Agent 平台（已集成 ACP / MCP / Skills）**

[主 README](README.md) | [English](README_EN.md)

</div>

---

## 安全声明

本项目仅用于**合法授权**的安全测试、攻防演练与研究。
请勿对未授权目标使用。

## 当前版本定位

本仓库已完成 Monorepo 架构改造，并打通了与 `opencode` 生态的关键能力：

- **ACP 通信**：客户端与 secbot agent 的协议层桥接
- **MCP 工具**：本地/远程 MCP 服务统一接入
- **Skills 系统**：secbot + opencode 风格技能统一发现与注入
- **计划与编辑能力**：支持 plan 模式与 opencode 风格文件编辑语义

## 目录结构

```text
apps/
  secbot-api/          # API 路由层
  secbot-cli/          # CLI/TUI 入口
  opencode-gateway/    # ACP 协议网关（stdio ND-JSON）

packages/
  secbot-core/         # 会话、规划、执行核心
  secbot-tools/        # 内置工具与系统能力
  secbot-skills/       # 原生技能系统
  shared-config/       # 统一配置、开关、MCP 配置读取
  opencode-adapters/   # MCP/技能/编辑/权限适配器
```

## 关键能力

- 多 Agent 协作 + Planner + 分层执行器
- ACP 协议会话生命周期与流式事件映射
- MCP 动态工具发现、包装与调用
- 统一技能加载（本地技能目录 + opencode 外部目录）
- 权限策略（`allow` / `ask` / `deny`）
- 三种模式：`agent` / `plan` / `ask`

## 快速开始

### 1）安装

```bash
python -m pip install -e .
```

### 2）启动后端与 CLI

```bash
secbot-server
# 或
python main.py --backend

secbot-cli
# 或
python main.py
```

### 3）启动 ACP 网关

```bash
python -m opencode_gateway.main
# 或安装脚本后
secbot-acp
```

## 功能灰度开关

通过环境变量控制新能力启用：

- `SECBOT_ACP_ENABLED`
- `SECBOT_MCP_ENABLED`
- `SECBOT_UNIFIED_SKILLS`
- `SECBOT_EDIT_TOOLS`
- `SECBOT_PLAN_MODE`
- `SECBOT_PERMISSIONS`

示例：

```bash
export SECBOT_ACP_ENABLED=true
export SECBOT_MCP_ENABLED=true
export SECBOT_UNIFIED_SKILLS=true
export SECBOT_EDIT_TOOLS=true
export SECBOT_PLAN_MODE=true
export SECBOT_PERMISSIONS=true
```

## MCP 配置示例

在项目根目录新建 `opencode.json`：

```json
{
  "mcp": {
    "local-server": {
      "type": "local",
      "command": ["node", "./path/to/server.js"]
    },
    "remote-server": {
      "type": "remote",
      "url": "https://example.com/mcp",
      "headers": {
        "Authorization": "Bearer xxx"
      }
    }
  }
}
```

## 测试

```bash
python -m pytest tests/test_monorepo_integration.py -v
```

## 文档

- 迁移与架构细节：`docs/MONOREPO_MIGRATION.md`
- 主 README：`README.md`
- 英文版：`README_EN.md`
