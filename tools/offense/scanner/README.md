# 扫描工具 (scanner)

## 模块概述

提供扩展扫描能力，与 `server/src/modules/tools/security/` 中的核心扫描工具互补。当前模块主要为占位结构，具体扫描逻辑分布在 `server/src/modules/scanner/` 及 `server/src/modules/tools/security/` 中。

## 工具列表

当前模块主要为占位结构，核心扫描能力见：
- `server/src/modules/tools/security/`：端口扫描、服务检测、漏洞扫描
- `server/src/modules/scanner/`：底层端口扫描实现

## 依赖关系

- 与 `server/src/modules/tools/security/`、`server/src/modules/scanner/` 协同
- 可扩展自定义扫描策略，通过继承 `BaseTool`（`server/src/modules/tools/core/base-tool.ts`）实现

## 安全与权限

- 扫描操作需在授权范围内进行
- 敏感扫描可能需管理员权限
