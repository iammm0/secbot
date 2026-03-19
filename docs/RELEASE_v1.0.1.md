# Secbot v1.0.1 发布说明

**发布日期**：2026 年 3 月  
**版本**：v1.0.1

---

## 概述

Secbot v1.0.1 是在 v1.0.0 基础上的增量更新，主要增强智能体与终端 TUI 的体验、补充 LLM 多提供商与 HTTP 回退能力，并完善文档与终端控制工具。

⚠️ **安全提醒**：本工具仅用于您拥有或已获得明确书面授权的系统。未经授权的使用可能违法，请遵守当地法律法规。

---

## 本版本更新

### 智能体与核心

- **PlannerAgent / QA / Specialist**：规划、问答与专职子智能体逻辑与配置调整，提升多智能体协作稳定性。
- **Session 与 Executor**：会话编排与分层执行器行为优化，与前端事件同步更一致。
- **Security ReAct 与 Models**：安全推理模式与核心数据模型小幅更新。

### 终端 TUI

- **UserMessageBlock**：新增用户消息块组件，会话视图中的用户输入展示更清晰。
- **BlockRenderer / contentBlocks / discriminators**：块类型与渲染逻辑增强，支持更多内容类型。
- **SyncContext / useChat / SessionView**：同步状态与聊天逻辑优化，ModelConfigDialog、MainContent 与 App 入口联动改进。
- **类型与块鉴别**：`types` 与 `blockDiscriminators` 更新，便于扩展新块类型。

### LLM 与配置

- **LLM HTTP 回退**：新增 `utils/llm_http_fallback.py`，在主要 LLM 调用失败时支持 HTTP 回退，提高可用性。
- **model_selector**：模型选择与多提供商支持逻辑更新。
- **LLM 多提供商文档**：新增 [LLM_PROVIDERS](LLM_PROVIDERS.md)，说明 DeepSeek、Ollama 等配置与切换方式。
- **hackbot_config**：配置初始化与提供商相关选项调整。
- **CLI**：`hackbot/cli` 与配置入口小幅优化。

### 工具与路由

- **terminal_tool**：`tools/offense/control/terminal_tool.py` 增强，终端控制与命令执行能力完善。
- **router**：`schemas`、`system` 等路由与数据结构更新，与前端及系统能力对齐。

### 文档与知识库

- **Repowiki**：项目概述与知识库系统文档更新（`.qoder/repowiki`）。

---

## 获取与安装

### 从 GitHub Release 安装（推荐）

1. 打开 [Secbot Releases](https://github.com/iammm0/secbot/releases)，选择 **v1.0.1**。
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
git checkout v1.0.1   # 可选，使用本版本
uv sync
```

依赖与运行环境见 [README](https://github.com/iammm0/secbot#readme) 与 [QUICKSTART](QUICKSTART.md)。

---

## 配置与运行

与 v1.0.0 一致。至少配置一种 LLM 后端（如 DeepSeek 或 Ollama），详见 [LLM_PROVIDERS](LLM_PROVIDERS.md)。

- **CLI 交互**：`uv run hackbot` 或解压后运行 `hackbot` / `hackbot.exe`。
- **API 服务**：`uv run python -m router.main`。
- **终端 TUI**：在 `terminal-ui` 下执行 `npm run start` 等。

更多选项见 [QUICKSTART](QUICKSTART.md) 与 [DEPLOYMENT](DEPLOYMENT.md)。

---

## 文档与资源

| 文档 | 说明 |
|------|------|
| [README](../README.md) | 项目总览、架构与功能 |
| [QUICKSTART](QUICKSTART.md) | 快速开始与常用命令 |
| [LLM_PROVIDERS](LLM_PROVIDERS.md) | LLM 多提供商配置（DeepSeek、Ollama 等） |
| [DEPLOYMENT](DEPLOYMENT.md) | 部署与运行环境 |
| [PROMPT_GUIDE](PROMPT_GUIDE.md) | 提示词与智能体配置 |
| [RELEASE](RELEASE.md) | 发布版使用与自行打包 |
| [RELEASE_v1.0.0](RELEASE_v1.0.0.md) | v1.0.0 发布说明 |
| [LICENSE](../LICENSE) | 开源协议（个人学习与学术可用；商用须授权） |

---

## 开源协议

本项目采用自定义开源协议：**个人学习与学术交流**可自由使用、修改与分发（须保留版权与协议）；**商业用途**须事先获得版权持有人书面授权。详见 [LICENSE](../LICENSE)。

---

## 致谢

感谢所有为本项目提供依赖与灵感的开源项目与社区，详见主 README 的致谢部分。

---

**Secbot v1.0.1** — 面向授权渗透测试的 AI 驱动安全测试平台。
