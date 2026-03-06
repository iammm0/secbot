# 实用工具 (utility)

## 模块概述

提供渗透测试与安全审计中的通用辅助能力，包括哈希计算、编码解码、IP 地理位置、文件分析、CVE 查询、日志分析、密码审计、敏感信息扫描、依赖漏洞审计和 Payload 生成。适用于安全巡检、漏洞挖掘、编码转换和漏洞研究。

## 工具列表

| 工具类 | 名称 | 用途 | 主要参数 |
|--------|------|------|----------|
| HashTool | hash | 哈希计算（MD5/SHA 等） | data, algorithm |
| EncodeDecodeTool | encode_decode | Base64/URL 等编解码 | data, mode |
| IpGeoTool | ip_geo | IP 地理位置查询 | ip |
| FileAnalyzeTool | file_analyze | 文件类型与内容分析 | path |
| CveLookupTool | cve_lookup | CVE 漏洞信息查询 | cve_id |
| LogAnalyzeTool | log_analyze | 日志分析与异常检测 | path |
| PasswordAuditTool | password_audit | 密码强度审计 | - |
| SecretScannerTool | secret_scanner | 敏感信息扫描 | path |
| DependencyAuditTool | dependency_audit | 依赖漏洞审计 | path |
| PayloadGeneratorTool | payload_generator | Payload 生成 | type, params |

## 依赖关系

- 继承 `tools.base.BaseTool`
- 被 `tools.pentest.security` 引入为 `UTILITY_TOOLS`

## 使用示例

```
用户: 查询 CVE-2024-1234 的详情
Agent: 调用 cve_lookup(cve_id="CVE-2024-1234")
```

## 安全与权限

- 均为 sensitivity=low
- 文件分析、日志分析等需注意路径权限
