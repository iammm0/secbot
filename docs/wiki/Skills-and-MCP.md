# Skills 与 MCP

## Skills 管理

Secbot 提供跨 **REST · TUI · CLI · Agent 工具** 的统一 Skills 层。

### TUI

```text
/skills
/skill <name>
/create-skill <name> [--description ...] [--trigger ...] [--tag ...]
```

### CLI

```bash
secbot skills list
secbot skills view <name>
secbot skills create <name> --description "..." --trigger recon --tag web
```

### REST

```text
GET  /api/skills
GET  /api/skills/:name
POST /api/skills
```

### 存储位置

创建的 Skill 脚手架位于：

```text
skills/custom/<slug>/SKILL.md
```

内置 Agent 工具：`list_skills` · `get_skill` · `create_skill`

---

## Secbot 作为 MCP Server

```bash
secbot-mcp
```

- 传输：stdio MCP  
- 暴露：`ToolsService` 当前目录  
- 敏感工具：默认隐藏  

```bash
SECBOT_MCP_ALLOW_SENSITIVE=true secbot-mcp   # 仅在明确需要时
```

---

## 从 Secbot 调用外部 MCP

使用内置 **`mcp_call`** 工具：

1. 连接外部 stdio MCP 服务器  
2. 列出远端工具  
3. 在 ReAct 流程中调用  

适用于把第三方 MCP 能力接入 Secbot 工作流。

---

## 相关文档

- [docs/SKILLS_AND_MEMORY.md](https://github.com/iammm0/secbot/blob/release/docs/SKILLS_AND_MEMORY.md)
- [[Tools|工具清单]]
