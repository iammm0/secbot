# Secbot v1.0.0 发布说明

**发布日期**：2026 年 3 月  
**版本**：v1.0.0（首个正式版本）

---

## 概述

Secbot（原 hackbot）v1.0.0 是面向**授权渗透测试**的 AI 驱动安全测试平台的第一个正式发布版本。本版本提供完整的多智能体架构、渗透测试工具链、主动防御与 Web 研究能力，支持 CLI、终端 TUI 与 API 多种使用方式。

⚠️ **安全提醒**：本工具仅用于您拥有或已获得明确书面授权的系统。未经授权的使用可能违法，请遵守当地法律法规。

---

## 主要特性

### 核心架构

- **多智能体协作**：PlannerAgent 结构化规划（Todo 依赖、资源与风险感知），CoordinatorAgent 协调专职子智能体，TaskExecutor 分层并发执行，SummaryAgent 汇总报告。
- **智能体模式**：ReAct、Plan-Execute、工具调用、记忆增强；支持网络侦察、Web 渗透、OSINT、终端运维、防御监控等专职子智能体。
- **攻击链编排**：信息收集 → 漏洞扫描 → 漏洞利用 → 后渗透，支持 LangGraph 工作流与漏洞库（CVE/NVD/Exploit-DB/MITRE）集成。

### 渗透测试与工具

- **信息收集与扫描**：端口扫描、服务检测、漏洞识别；子域名枚举、DNS、WHOIS、SSL 分析等。
- **漏洞利用**：SQL 注入、XSS、命令注入、文件上传、路径遍历、SSRF 等自动化利用；可选集成 SQLMap、Nuclei、MSF 等封装。
- **Web 研究**：DuckDuckGo 智能搜索、网页提取、深度爬取、通用 API 客户端；可委托 WebResearchAgent 或主智能体直接调用。
- **后渗透与 Payload**：权限提升、持久化、横向移动；Payload 生成与攻击链自动化。

### 安全与防御

- **主动防御**：网络发现、入侵检测、漏洞扫描、网络分析、安全报告生成。
- **授权与远程**：授权管理、远程命令执行与文件传输（仅限授权主机）。

### 交互与集成

- **CLI**：Typer 命令行入口，配置与交互式安全测试。
- **终端 TUI**：TypeScript + Ink 终端界面，通过 FastAPI + SSE 与后端通信。
- **API**：FastAPI 提供 `/api/chat`（SSE）等接口，可供移动端或第三方前端集成。
- **持久化**：SQLite 存储对话、提示词链与配置；可选 SQLite-Vec 向量检索。

### 其他

- **提示词链管理**：YAML 配置智能体提示词。
- **语音**：可选语音输入（STT）与输出（TTS）。
- **单文件发布**：支持通过 GitHub Actions 构建 Windows / Linux / macOS 可执行包，无需本地安装 Python 即可运行。

---

## 获取与安装

### 从 GitHub Release 安装（推荐）

1. 打开 [Secbot Releases](https://github.com/iammm0/secbot/releases)，选择 **v1.0.0**。
2. 下载对应平台 zip：
   - `secbot-windows-amd64.zip` — Windows
   - `secbot-linux-amd64.zip` — Linux x86_64
   - `secbot-darwin-arm64.zip` — macOS（Apple 芯片）
   - `secbot-darwin-amd64.zip` — macOS（Intel）
3. 解压后进入解压目录，配置 API Key 后运行可执行文件（见下方「配置与运行」）。

### 从源码安装

```bash
git clone https://github.com/iammm0/secbot.git
cd secbot
uv sync   # 或 pip install -e .
```

依赖与运行环境见 [README](https://github.com/iammm0/secbot#readme) 与 [QUICKSTART](QUICKSTART.md)。

---

## 配置与运行

### 必需配置：LLM API Key

至少配置一种推理后端（如 DeepSeek）的 API Key：

- **环境变量**：`DEEPSEEK_API_KEY=sk-xxx`（或 `OLLAMA_BASE_URL` 使用本地 Ollama）。
- **.env 文件**：在项目根或解压目录下创建 `.env`，写入：
  ```env
  DEEPSEEK_API_KEY=sk-xxx
  LLM_PROVIDER=deepseek
  ```
  获取 DeepSeek API Key：<https://platform.deepseek.com>。

### 运行方式

- **CLI 交互**（默认进入交互式安全测试）：
  ```bash
  uv run hackbot
  # 或解压后：./hackbot  / hackbot.exe
  ```
- **启动 API 服务**（供 TUI / 移动端连接）：
  ```bash
  uv run python -m router.main
  ```
- **终端 TUI**：在 `terminal-ui` 目录下执行 `npm run start` 等（见 terminal-ui/README.md）。

更多选项见 [QUICKSTART](QUICKSTART.md) 与 [DEPLOYMENT](DEPLOYMENT.md)。

---

## 文档与资源

| 文档 | 说明 |
|------|------|
| [README](../README.md) | 项目总览、架构与功能 |
| [QUICKSTART](QUICKSTART.md) | 快速开始与常用命令 |
| [DEPLOYMENT](DEPLOYMENT.md) | 部署与运行环境 |
| [PROMPT_GUIDE](PROMPT_GUIDE.md) | 提示词与智能体配置 |
| [RELEASE](RELEASE.md) | 发布版使用与自行打包 |
| [LICENSE](../LICENSE) | 开源协议（个人学习与学术可用；商用须授权） |

---

## 开源协议

本项目采用自定义开源协议：**个人学习与学术交流**可自由使用、修改与分发（须保留版权与协议）；**商业用途**须事先获得版权持有人书面授权。详见 [LICENSE](../LICENSE)。

---

## 致谢

感谢所有为本项目提供依赖与灵感的开源项目与社区（LangChain、FastAPI、Ink、SQLite 等），详见主 README 的致谢部分。

---

**Secbot v1.0.0** — 面向授权渗透测试的 AI 驱动安全测试平台。
