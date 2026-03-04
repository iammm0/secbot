# Secbot

> 开源自动化安全测试智能体 — 纯 TypeScript 实现

Secbot 是一个基于 ReAct（Reasoning + Acting）模式的 AI 安全测试智能体，集成端口扫描、服务识别、漏洞检测、Web 安全分析等 12+ 种安全工具，通过 LLM 驱动自动化渗透测试流程。

## 系统要求

- **Node.js** 18+（推荐 20 LTS）
- **LLM 后端**（二选一）：
  - [Ollama](https://ollama.com)（本地运行，无需 API Key）
  - DeepSeek / OpenAI 兼容 API（需设置 API Key）

## 快速开始

```bash
# 克隆项目
git clone https://github.com/iammm0/secbot.git secbot
cd secbot

# 安装依赖
cd server && npm install && cd ..
cd terminal-ui && npm install && cd ..

# 启动后端（开发模式）
npm run dev

# 在另一个终端启动 TUI
npm run tui
```

## 项目结构

```
secbot/
├── server/          # NestJS 后端（核心 Agent + 安全工具 + API）
├── terminal-ui/     # 终端 TUI（Ink + React）
├── app/             # 移动端 App（Expo + React Native）
└── package.json     # 根级脚本入口
```

## 常用命令

| 命令 | 说明 |
|------|------|
| `npm run dev` | 启动后端（开发模式，热重载） |
| `npm run tui` | 启动终端 TUI |
| `npm run dev:all` | 同时启动后端 + TUI |
| `npm run build` | 构建生产版本 |
| `npm start` | 启动生产版本 |

## 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `LLM_PROVIDER` | `ollama` | LLM 后端（ollama / deepseek / openai） |
| `OLLAMA_MODEL` | `llama3.2` | Ollama 模型名 |
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Ollama 服务地址 |
| `DEEPSEEK_API_KEY` | - | DeepSeek API Key |
| `PORT` | `8000` | 后端监听端口 |
| `SECBOT_API_URL` | `http://localhost:8000` | TUI 连接的后端地址 |

## 集成的安全工具

- **端口扫描** — TCP connect 扫描目标主机开放端口
- **服务识别** — 识别端口上运行的服务类型
- **漏洞扫描** — 检测已知漏洞
- **信息收集** — DNS 解析与基础信息收集
- **DNS 查询** — 查询域名 DNS 记录（A/AAAA/MX/NS/TXT）
- **WHOIS 查询** — 查询域名或 IP 注册信息
- **HTTP 请求** — 发送 HTTP 请求并分析响应
- **HTTP 头分析** — 分析网站安全头配置
- **CORS 检查** — 检测跨域资源共享配置
- **SSL/TLS 分析** — 分析证书与加密配置
- **子域名枚举** — 枚举目标域名的子域名
- **技术检测** — 识别网站使用的技术栈

## 许可证

MIT
