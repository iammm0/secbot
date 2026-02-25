# 攻击控制工具 (offense/control)

## 模块概述

提供远程命令执行与系统控制能力，供 Agent 在授权范围内执行系统命令。适用于渗透测试中的命令执行、脚本运行和系统操作。

## 工具列表

| 工具类 | 名称 | 用途 | 主要参数 |
|--------|------|------|----------|
| CommandTool | execute_command | 执行系统命令 | command, cwd, timeout |

## 依赖关系

- 继承 `tools.base.BaseTool`
- 被 `tools.pentest.security` 引入，与 CrawlerTool 一起加入 `BASIC_SECURITY_TOOLS`
- 敏感操作可能触发 root 权限确认

## 使用示例

```
用户: 执行 ls -la
Agent: 调用 execute_command(command="ls -la")
```

## 安全与权限

- 部分命令需 root 权限，会触发 `ROOT_REQUIRED` 事件等待用户确认
- SuperHackbot 模式下敏感命令需用户确认
