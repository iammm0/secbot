# OSINT 情报工具 (osint)

## 模块概述

提供开源情报收集能力，包括 Shodan 查询、VirusTotal 检测、证书透明度查询和凭据泄露检查。适用于目标信息收集、威胁情报和资产发现。

## 工具列表

| 工具类 | 名称 | 用途 | 主要参数 |
|--------|------|------|----------|
| ShodanQueryTool | shodan_query | Shodan 搜索引擎查询 | query, ip |
| VirusTotalTool | virustotal | VirusTotal 文件/URL 检测 | url, hash |
| CertTransparencyTool | cert_transparency | 证书透明度日志查询 | domain |
| CredentialLeakTool | credential_leak | 凭据泄露检查 | email, domain |

## 依赖关系

- 继承 `BaseTool`（`server/src/modules/tools/core/base-tool.ts`）
- 通过 `server/src/modules/tools/osint/index.ts` 导出，由 `ToolsService` 自动发现与注册
- Shodan、VirusTotal 需在环境变量中配置 API Key

## 使用示例

```typescript
// Agent 调用示例
const result = await shodanQueryTool.execute({ ip: '1.2.3.4' });
```

```
用户: 在 Shodan 上查询 1.2.3.4 的信息
Agent: 调用 shodan_query(ip="1.2.3.4")
```

## 安全与权限

- 均为 sensitivity=low
- 需在环境变量中设置 `SHODAN_API_KEY`、`VIRUSTOTAL_API_KEY` 等
