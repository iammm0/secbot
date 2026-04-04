# 攻击控制工具 (control)

## 模块概述

提供远程命令执行与系统控制能力，供 Agent 在授权范围内执行系统命令。适用于渗透测试中的命令执行、脚本运行和系统操作。

## 工具列表

| 工具类 | 名称 | 用途 | 主要参数 |
|--------|------|------|----------|
| CommandTool | execute_command | 执行系统命令 | command, cwd, timeout |

## 依赖关系

- 继承 `BaseTool`（`server/src/modules/tools/core/base-tool.ts`）
- 通过 `server/src/modules/tools/control/index.ts` 导出，由 `ToolsService` 自动发现与注册
- 与 CrawlerTool 一起归入 `BASIC_SECURITY_TOOLS` 分组
- 敏感操作可能触发管理员权限确认

## 使用示例

```typescript
// Agent 调用示例
const result = await commandTool.execute({ command: 'ls -la' });
```

```
用户: 执行 ls -la
Agent: 调用 execute_command(command="ls -la")
```

## 安全与权限

- 部分命令需管理员权限，会触发 `ROOT_REQUIRED` 事件等待用户确认
- SuperAgent 模式下敏感命令需用户确认
