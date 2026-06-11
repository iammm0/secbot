# 安全与合规

## 授权测试声明

**Secbot 仅用于：**

- 你拥有或已获得 **明确书面授权** 的系统上的安全测试  
- 安全研究与教育  

**禁止：**

- 对未授权目标进行扫描、渗透或破坏性操作  
- 任何违反当地法律法规的用途  

## 工具风险等级

| 机制 | 说明 |
| --- | --- |
| `sensitive` 工具标记 | 探索阶段与默认 MCP 下不可用 |
| ExploreAgent | 设计为只读侦察（`browser_session`、漏洞库查询等） |
| `SECBOT_MCP_ALLOW_SENSITIVE` | 需显式开启才向 MCP 客户端暴露敏感工具 |

## 法律与道德

使用前请阅读仓库：

- [docs/SECURITY_WARNING.md](https://github.com/iammm0/secbot/blob/release/docs/SECURITY_WARNING.md)

## 负责任披露

若你在授权测试中发现漏洞，请按目标组织的安全披露流程处理，而非公开未修复细节。

## 数据与隐私

- 会话与配置存储在本地 SQLite  
- LLM 请求发送至你所配置的 provider（DeepSeek / Ollama 等）  
- 请勿将生产密钥、客户数据放入未受控的 prompt  

## 报告问题

- [GitHub Issues](https://github.com/iammm0/secbot/issues) — Bug 与功能请求  
- 安全漏洞请通过私有渠道联系维护者（勿公开 exploit 细节）
