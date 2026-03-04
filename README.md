# SecBot

> AI 安全测试机器人 —— Go 实现，极致快速的纯终端体验

SecBot 是一个基于 LLM（大语言模型）驱动的安全测试自动化工具。它使用 Go 构建，通过 LangChainGo 框架接入多种 LLM 后端，结合 ReAct 思维链模式智能调用安全工具，实现自动化的渗透测试、网络侦察和安全评估。

## 特性

- **极致性能**：Go 编译为原生二进制，启动即用，毫秒级响应
- **多 LLM 支持**：DeepSeek、Ollama（本地）、OpenAI 等
- **智能 Agent**：ReAct 推理循环，自动分解和执行安全任务
- **丰富工具集**：端口扫描、DNS 查询、HTTP 分析、SSL 检查、WHOIS、技术栈检测等
- **纯终端交互**：无需浏览器、无需 GUI，SSH 远程即可使用
- **安全优先**：仅在授权范围内操作，详细记录所有操作

## 快速开始

### 前置条件

- Go 1.21+
- LLM API Key（DeepSeek / OpenAI）或本地 Ollama

### 安装与运行

```bash
# 克隆项目
git clone https://github.com/yourusername/secbot.git
cd secbot
git checkout refactor-by-go

# 配置环境变量
cp .env.example .env
# 编辑 .env，填入你的 API Key

# 直接运行
go run ./cmd/secbot/

# 或编译后运行
go build -o bin/secbot ./cmd/secbot/
./bin/secbot
```

### 使用示例

```
secbot> 扫描 example.com 的开放端口
secbot> 检查 github.com 的 SSL 证书
secbot> 分析 example.com 的 HTTP 安全头
secbot> 对 example.com 做全面安全评估
secbot> 计算 "password123" 的哈希值
secbot> 查询 8.8.8.8 的地理位置
```

### 内置命令

| 命令 | 说明 |
|------|------|
| `/help` | 显示帮助信息 |
| `/tools` | 列出可用安全工具 |
| `/clear` | 清屏 |
| `/version` | 版本信息 |
| `/exit` | 退出 |

## 架构

```
secbot/
├── cmd/secbot/          # CLI 入口
├── config/              # 配置管理
├── internal/
│   ├── agent/           # Agent 层（路由、安全Agent、规划Agent）
│   ├── patterns/        # 设计模式（ReAct、路由、规划、反思）
│   ├── memory/          # 会话记忆管理
│   ├── session/         # 会话编排
│   ├── llm/             # LLM 提供商接入
│   └── tools/           # 安全工具集
│       ├── pentest/     # 渗透测试
│       ├── network/     # 网络工具
│       ├── web/         # Web 安全
│       ├── utility/     # 通用工具
│       └── defense/     # 防御工具
├── pkg/
│   ├── event/           # 事件总线
│   └── logger/          # 日志系统
└── docs/                # 文档
```

## 安全警告

SecBot 包含安全测试工具，**仅限在授权环境中使用**。未经授权对目标系统进行测试可能违反法律。详见 [SECURITY_WARNING.md](docs/SECURITY_WARNING.md)。

## 许可证

MIT License
