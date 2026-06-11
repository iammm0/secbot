# 工具清单

工具由 `ToolsService` 统一注册，按类别组织。Explore 阶段会拒绝 `sensitive` 工具。

## 类别概览

| 类别 | 示例能力 |
| --- | --- |
| **security** | nmap、nuclei、nikto、端口扫描、目录爆破、WAF 检测、JWT 分析… |
| **web-research** | 智能搜索、深度爬取、browser_session、页面提取 |
| **vuln-db** | 统一漏洞库查询（NVD/CVE/Exploit-DB/MITRE） |
| **protocol** | SSH/FTP/MySQL/Redis/SMB/LDAP/SNMP 探测 |
| **osint** | Shodan、证书透明度、凭证泄露检查 |
| **cloud** | 多云存储桶枚举 |
| **defense** | 入侵检测、容器逃逸检查、系统信息 |
| **utility** | 编解码、哈希、依赖审计、日志分析 |
| **control** | shell 命令、终端会话、install_tool、ExecGo bridge |
| **reporting** | 报告生成（含 CVSS 摘要） |
| **skills** | list/get/create skill |
| **mcp** | 调用外部 MCP 服务器 |
| **crawler** | Web 爬虫 |

## 自动安装缺失工具

`install_tool` 可在授权环境中尝试安装缺失的安全 CLI 工具（见 Agent prompt 策略）。

## 敏感工具策略

- 工具可标记 `sensitive: true`
- **ExploreAgent** 与默认 **MCP** 模式下会隐藏/拒绝
- MCP 显式开放：`SECBOT_MCP_ALLOW_SENSITIVE=true`

## 扩展工具

1. 在 `server/src/modules/tools/` 下实现 `BaseTool` 子类  
2. 在对应 `index.ts` 与 `tools.module.ts` 注册  
3. 参考 [docs/TOOL_EXTENSION.md](https://github.com/iammm0/secbot/blob/release/docs/TOOL_EXTENSION.md)

## API 发现

运行后端后，工具亦可通过内部 Agent 工具列表或 MCP `secbot-mcp` 发现。

## 相关

- [[Skills-and-MCP|Skills 与 MCP]]
- [[Agent-Orchestration|Explore 阶段限制]]
