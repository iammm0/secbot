# SecBot (Go)

AI 驱动的自动化安全测试 CLI — 纯 Go 实现。

## 功能

- **Cobra CLI**：子命令（`secbot`/`secbot model`/`secbot server`/`secbot version`）+ `--agent`/`--ask` 标志
- **四阶段编排**：意图路由 → 任务规划 → 分层执行 → 摘要报告
- **多智能体协调**：CoordinatorAgent + 5 专职子 Agent（NetworkRecon/WebPentest/OSINT/TerminalOps/DefenseMonitor）
- **54+ 安全工具**：渗透/网络/Web/协议/OSINT/通用/防御/云/控制/WebResearch/爬虫
- **多 LLM 后端**：DeepSeek/OpenAI/Ollama/Groq/OpenRouter/智谱/通义/Moonshot/Together/Mistral 等 20+ 厂商
- **SQLite 持久化**：对话/配置/审计/扫描结果
- **记忆系统**：短期对话 + 情景记忆 + 长期记忆
- **漏洞数据库**：NVD/CVE 查询
- **EventBus**：完整事件流驱动 CLI 渲染

## 快速开始

```bash
# 安装依赖
go mod tidy

# 配置
cp .env.example .env
# 编辑 .env 设置 LLM_PROVIDER 和 API Key

# 运行
go run ./cmd/secbot/

# 或构建后运行
go build -o secbot ./cmd/secbot/
./secbot
```

## 使用

```bash
# 交互模式
secbot

# 单次任务
secbot "扫描 192.168.1.1 的开放端口"

# 问答模式
secbot --ask "什么是 SQL 注入？"

# 专家模式
secbot --agent superhackbot

# 切换模型
secbot model

# 查看版本
secbot version
```

## 目录结构

```
secbot/
├── cmd/secbot/          # Cobra CLI 入口
├── config/              # 配置管理
├── internal/
│   ├── agent/           # Agent 体系（Coordinator/Specialist/Hackbot/Planner/Summary）
│   ├── cli/             # CLI 事件渲染器
│   ├── database/        # SQLite 持久化
│   ├── llm/             # 多厂商 LLM 提供者
│   ├── memory/          # 记忆系统（短期/情景/长期）
│   ├── models/          # 核心数据模型
│   ├── patterns/        # ReAct/Planning/Routing 模式
│   ├── prompts/         # 提示词管理
│   ├── session/         # SessionManager + TaskExecutor
│   ├── tools/           # 54+ 安全工具
│   │   ├── cloud/       # 云安全
│   │   ├── control/     # 终端/命令控制
│   │   ├── crawler/     # 网页爬虫
│   │   ├── defense/     # 防御自检
│   │   ├── network/     # 网络侦察
│   │   ├── osint/       # 开源情报
│   │   ├── pentest/     # 渗透测试
│   │   ├── protocol/    # 协议探测
│   │   ├── reporting/   # 报告生成
│   │   ├── utility/     # 通用工具
│   │   ├── web/         # Web 安全
│   │   └── webresearch/ # Web 研究
│   └── vulndb/          # 漏洞数据库
└── pkg/
    ├── event/           # EventBus
    └── logger/          # 日志
```

## 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `LLM_PROVIDER` | LLM 后端 | `deepseek` |
| `DEEPSEEK_API_KEY` | DeepSeek API Key | - |
| `MODEL_NAME` | 模型名 | `deepseek-chat` |
| `OLLAMA_URL` | Ollama 地址 | `http://localhost:11434` |
| `DATABASE_URL` | SQLite 路径 | `data/secbot.db` |
| `LOG_LEVEL` | 日志级别 | `INFO` |

## 许可证

[LICENSE](LICENSE)

## 作者

赵明俊 — [@iammm0](https://github.com/iammm0)
