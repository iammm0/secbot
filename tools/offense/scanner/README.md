# 扫描工具 (offense/scanner)

## 模块概述

提供扩展扫描能力，与 `tools.pentest.security` 中的核心扫描工具互补。当前模块主要为占位结构，具体扫描逻辑分布在 `scanner` 包及 `tools.pentest` 中。

## 工具列表

当前模块主要为占位结构，核心扫描能力见：
- `tools.pentest.security`：端口扫描、服务检测、漏洞扫描
- `scanner.port_scanner`：底层端口扫描实现

## 依赖关系

- 与 `tools.pentest.security`、`scanner` 包协同
- 可扩展自定义扫描策略

## 安全与权限

- 扫描操作需在授权范围内进行
- 敏感扫描可能需 root 权限
