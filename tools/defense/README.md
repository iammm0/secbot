# 防御工具 (defense)

## 模块概述

提供主动防御与安全自检能力，包括防御扫描、自漏洞扫描、网络分析、入侵检测和系统信息收集。适用于内网安全巡检、异常检测和合规检查。

## 工具列表

| 工具类 | 名称 | 用途 | 主要参数 |
|--------|------|------|----------|
| DefenseScanTool | defense_scan | 防御配置与策略扫描 | target |
| SelfVulnScanTool | self_vuln_scan | 本机漏洞自检 | - |
| NetworkAnalyzeTool | network_analyze | 网络连接与流量分析 | - |
| IntrusionDetectTool | intrusion_detect | 入侵检测与告警 | - |
| SystemInfoTool | system_info | 系统信息收集 | - |

## 依赖关系

- 继承 `tools.base.BaseTool`
- 被 `tools.pentest.security` 引入为 `DEFENSE_TOOLS`
- 部分工具可能依赖 root 权限（如网络分析）

## 使用示例

```
用户: 检查本机系统信息
Agent: 调用 system_info()
```

## 安全与权限

- `system_info`、`network_analyze` 为瞬时工具，完成后在 UI 中可折叠
- 部分防御扫描可能需要 root 权限
