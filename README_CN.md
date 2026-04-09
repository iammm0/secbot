# Secbot（Python CLI）

[![PyPI version](https://img.shields.io/pypi/v/secbot.svg)](https://pypi.org/project/secbot/)
[![Python versions](https://img.shields.io/pypi/pyversions/secbot.svg)](https://pypi.org/project/secbot/)
[![PyPI downloads](https://img.shields.io/pypi/dm/secbot.svg)](https://pypi.org/project/secbot/)
[![License](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

面向**已授权**的安全测试、研究与教学的 AI 安全自动化 **命令行工具**（Typer + Rich）。

> **安全提示**：仅在您拥有或已获明确书面授权的环境中使用。未授权的扫描、利用与控制行为可能触犯法律或监管规定。

[English](README_EN.md) | 中文（本文）

![Secbot 主界面](https://raw.githubusercontent.com/iammm0/secbot/main-py-version/assets/secbot-main.png)

## 为何选择本包

- **CLI 优先**：交互式与一次性任务均在终端内完成。
- **可选 API**：`secbot server` 提供 FastAPI（REST / SSE），便于接入自动化流水线。
- **多智能体**：`secbot-cli` 与 `superhackbot` 等模式，覆盖规划、执行与总结闭环。
- **安全工具链**：网络、Web、OSINT、防御巡检、报告与系统类工具集成。
- **多模型后端**：Ollama、DeepSeek、OpenAI 兼容接口等。

## 环境要求

- Python `>= 3.10`
- `pip` 或 `uv`
- 可选：本地模型时使用 Ollama

## 安装

### 从 PyPI 安装（推荐）

```bash
pip install secbot
```

预发布 / 测试版本：

```bash
pip install --pre secbot
```

### 使用 uv

```bash
uv pip install secbot
```

### 从源码安装（开发）

```bash
git clone https://github.com/iammm0/secbot.git
cd secbot
uv sync
uv pip install -e .
```

安装后控制台命令为 **`secbot`**（亦可能注册为 `hackbot`，取决于安装方式）。

## 快速开始

### 1. 配置环境变量

在工作目录创建 `.env`：

```env
# 云端模型（示例：DeepSeek）
LLM_PROVIDER=deepseek
DEEPSEEK_API_KEY=sk-your-api-key
DEEPSEEK_MODEL=deepseek-reasoner

# 可选：本地 Ollama
# LLM_PROVIDER=ollama
# OLLAMA_BASE_URL=http://localhost:11434
# OLLAMA_MODEL=gemma3:1b
# OLLAMA_EMBEDDING_MODEL=nomic-embed-text
```

### 2. 运行 CLI

```bash
# 交互模式
secbot

# 单次任务
secbot "扫描 192.168.1.1 的开放端口"

# 问答模式（不执行工具）
secbot --ask "什么是 XSS？"

# 专家智能体
secbot --agent superhackbot

# 切换后端 / 模型
secbot model
```

从源码仓运行时，也可使用：`python scripts/main.py`（需在仓库根目录）。

### 3. 启动 API（可选）

```bash
secbot server
```

## 常用子命令

| 命令 | 说明 |
| --- | --- |
| `secbot` | 进入交互模式 |
| `secbot "<任务>"` | 执行单次任务 |
| `secbot --ask "<问题>"` | 安全问答 |
| `secbot --agent superhackbot` | 使用专家模式 |
| `secbot model` | 配置提供商 / 模型 / 密钥 |
| `secbot server` | 启动 FastAPI 后端 |
| `secbot version` | 显示已安装版本 |

## 常见环境变量

| 变量 | 作用 | 默认 |
| --- | --- | --- |
| `LLM_PROVIDER` | 当前模型提供商 | `deepseek` |
| `DEEPSEEK_API_KEY` | DeepSeek API 密钥 | 无 |
| `DEEPSEEK_MODEL` | DeepSeek 模型名 | `deepseek-reasoner` |
| `OLLAMA_BASE_URL` | Ollama 地址 | `http://localhost:11434` |
| `OLLAMA_MODEL` | Ollama 生成模型 | `gemma3:1b` |
| `OLLAMA_EMBEDDING_MODEL` | Ollama 嵌入模型 | `nomic-embed-text` |
| `DATABASE_URL` | SQLite 连接串 | `sqlite:///./data/secbot.db` |
| `LOG_LEVEL` | 日志级别 | `INFO` |

## 文档

- [快速开始](https://github.com/iammm0/secbot/blob/main-py-version/docs/QUICKSTART.md)
- [API 说明](https://github.com/iammm0/secbot/blob/main-py-version/docs/API.md)
- [LLM 提供商](https://github.com/iammm0/secbot/blob/main-py-version/docs/LLM_PROVIDERS.md)
- [Ollama 配置](https://github.com/iammm0/secbot/blob/main-py-version/docs/OLLAMA_SETUP.md)
- [部署](https://github.com/iammm0/secbot/blob/main-py-version/docs/DEPLOYMENT.md)
- [发布说明](https://github.com/iammm0/secbot/blob/main-py-version/docs/RELEASE.md)
- [数据库](https://github.com/iammm0/secbot/blob/main-py-version/docs/DATABASE_GUIDE.md)
- [安全与合规提示](https://github.com/iammm0/secbot/blob/main-py-version/docs/SECURITY_WARNING.md)

## 项目链接

- 主页：[https://github.com/iammm0/secbot](https://github.com/iammm0/secbot)
- Issues：[https://github.com/iammm0/secbot/issues](https://github.com/iammm0/secbot/issues)
- Releases：[https://github.com/iammm0/secbot/releases](https://github.com/iammm0/secbot/releases)
- PyPI：[https://pypi.org/project/secbot/](https://pypi.org/project/secbot/)

## 许可证

本项目以 **MIT** 许可证发布，详见 [LICENSE](LICENSE)。
