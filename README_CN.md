# hackbot: 自动化渗透测试机器人

<div align="center">

![Python](https://img.shields.io/badge/python-3.10+-blue.svg)
![License](https://img.shields.io/badge/license-MIT-green.svg)
![Status](https://img.shields.io/badge/status-beta-orange.svg)

**一个智能化的自动化渗透测试机器人，具备AI驱动的安全测试能力**

[English](README.md) | [中文](#m-bot-自动化渗透测试机器人)

</div>

---

## ⚠️ 安全警告

**本工具仅用于授权的安全测试。未经授权使用本工具进行网络攻击是违法的。**

- ✅ 仅对您拥有或已获得明确书面授权的系统使用
- ✅ 确保遵守所有适用的法律法规
- ✅ 负责任和道德地使用

## 🚀 功能特性

### 核心能力

- 🤖 **多种智能体模式**: ReAct、Plan-Execute、多智能体、工具使用、记忆增强
- 💻 **命令行界面**: 使用Typer构建的直观命令行交互
- 🎤 **语音交互**: 完整的语音转文字和文字转语音功能
- 🕷️ **AI网络爬虫**: 实时网络信息捕获和监控
- 💻 **操作系统控制**: 文件操作、进程管理、系统信息

### 渗透测试

- 🔍 **信息收集**: 自动化信息收集（主机名、IP、端口、服务）
- 🔍 **漏洞扫描**: 端口扫描、服务检测、漏洞识别
- ⚔️ **漏洞利用引擎**: 自动化执行SQL注入、XSS、命令注入、文件上传、路径遍历、SSRF等漏洞利用
- 🔗 **自动化攻击链**: 完整的渗透测试工作流自动化
  - 信息收集 → 漏洞扫描 → 漏洞利用 → 后渗透
- 📦 **Payload生成器**: 自动生成各种攻击payload
- 🎯 **后渗透利用**: 权限提升、持久化、横向移动、数据exfiltration
- ⚔️ **网络攻击**: 暴力破解、DoS测试、缓冲区溢出（仅限授权测试）

### 安全与防御

- 🛡️ **主动防御**: 信息收集、漏洞扫描、网络分析、入侵检测
- 📊 **安全报告**: 自动化详细安全分析报告
- 🔍 **网络发现**: 自动发现网络中的所有主机
- 🎯 **授权管理**: 管理对目标主机的合法授权
- 🖥️ **远程控制**: 在授权主机上执行远程命令和文件传输

### 附加功能

- 📝 **提示词链管理**: 灵活的智能体提示词配置
- 💾 **SQLite数据库**: 持久化存储对话历史、提示词链、配置
- 🐳 **Docker Compose**: 快速启动ChromaDB和Redis开发环境
- ⏰ **任务调度**: 支持定时执行渗透测试任务
- 🎨 **美观的终端输出**: 使用Rich库的丰富格式化

## 📋 系统要求

- Python 3.10+
- [uv](https://github.com/astral-sh/uv) (推荐包管理器) 或 pip
- Ollama (用于LLM推理)
- 依赖在 `pyproject.toml` 中管理

## 🛠️ 安装

### 1. 克隆仓库

```bash
git clone https://github.com/iammm0/m-bot.git
cd m-bot
```

### 2. 安装依赖

#### 使用 uv (推荐)
[uv](https://github.com/astral-sh/uv) 是一个快速的Python包安装器和解析器。

```bash
# 如果尚未安装uv，请先安装
curl -LsSf https://astral.sh/uv/install.sh | sh

# 使用uv安装依赖
uv sync
```

#### 使用 pip (备选方案)
```bash
pip install -r requirements.txt
```

### 3. 安装并启动Ollama

```bash
# 从 https://ollama.ai 安装Ollama

# 下载所需模型
ollama pull gpt-oss:20b
ollama pull nomic-embed-text

# Ollama服务默认运行在 http://localhost:11434
```

### 4. 配置环境变量

```bash
cp .env.example .env
```

编辑 `.env` 文件：
- `OLLAMA_MODEL`: 推理模型（默认: `gpt-oss:20b`）
- `OLLAMA_EMBEDDING_MODEL`: 嵌入模型（默认: `nomic-embed-text`）

### 5. 构建并安装（可选）

```bash
# 构建包
python -m build

# 安装包 (使用 uv - 推荐)
uv pip install dist/m_bot-1.0.0-py3-none-any.whl

# 备选方案使用 pip
# pip install dist/m_bot-1.0.0-py3-none-any.whl

# 现在可以直接使用 'hackbot' 命令
hackbot --help
```

## 🎯 快速开始

### 基本使用

```bash
# 查看帮助
hackbot --help

# 交互式聊天
hackbot interactive

# 文本聊天
hackbot chat "你好，介绍一下你自己"

# 列出可用智能体
hackbot list-agents
```

### 渗透测试命令

```bash
# 网络发现
hackbot discover

# 端口扫描（通过聊天）
hackbot chat "扫描 192.168.1.1 的端口"

# 列出已授权目标
hackbot list-targets

# 撤销授权
hackbot revoke 192.168.1.100

# 注意：高级漏洞利用命令（exploit, attack-chain, generate-payload）
# 在实验版本中可用。运行 'hackbot --help' 查看完整命令列表。
```

### 远程控制命令

```bash
# 在授权主机上执行远程命令
hackbot remote-execute 192.168.1.100 "ls -la"

# 上传文件到远程主机
hackbot upload-file 192.168.1.100 local.txt /remote/path/

# 从远程主机下载文件
hackbot download-file 192.168.1.100 /remote/file.txt local_copy.txt

# 列出所有授权
hackbot list-authorizations
```

### 防御系统命令

```bash
# 执行全面安全扫描
hackbot defense-scan

# 启动防御监控
hackbot defense-monitor --start --interval 60

# 查看防御状态
hackbot defense-monitor --status

# 列出被封禁的IP
hackbot defense-blocked --list

# 生成防御报告
hackbot defense-report --type vulnerability
```

### 系统操作

```bash
# 系统信息
hackbot system-info

# 系统状态
hackbot system-status

# 列出进程
hackbot list-processes --filter python

# 执行命令
hackbot execute "ls -la"

# 列出目录中的文件
hackbot file-list /path/to/dir --recursive
```

### 数据库管理

```bash
# 查看统计信息
hackbot db-stats

# 查看对话历史
hackbot db-history --limit 20

# 清空历史（需要确认）
hackbot db-clear --yes
```

### 语音交互命令

```bash
# 语音转文字转录
hackbot transcribe audio.wav --output transcript.txt

# 文字转语音合成
hackbot synthesize "Hello world" --output speech.wav --language en

# 与智能体语音聊天
hackbot voice audio.wav --agent hackbot
```

### 提示词管理命令

```bash
# 列出可用提示词模板和链
hackbot prompt-list

# 创建新的提示词链
hackbot prompt-create my_chain --role "安全专家" --instruction "执行渗透测试"

# 从文件加载提示词链
hackbot prompt-load my_prompt.yaml
```

## 📁 项目结构

```
m-bot/
├── main.py                 # CLI应用入口
├── config.py               # 配置管理
├── m_bot/                  # 包CLI模块
├── agents/                 # 智能体实现
│   ├── base.py            # 基础智能体类
│   └── langchain_agent.py # LangChain智能体
├── patterns/               # 设计模式
│   └── react.py           # ReAct模式
├── exploit/                # 漏洞利用模块
│   ├── exploit_engine.py  # 漏洞利用引擎
│   ├── web_exploits.py    # Web漏洞利用
│   ├── network_exploits.py # 网络漏洞利用
│   └── post_exploitation.py # 后渗透利用
├── attack_chain/           # 自动化攻击链
│   ├── attack_chain.py     # 主攻击链
│   ├── reconnaissance.py   # 信息收集
│   └── exploitation.py    # 漏洞利用协调
├── payloads/               # Payload生成器
│   ├── web_payloads.py     # Web payload
│   └── network_payloads.py # 网络payload
├── scanner/                # 扫描工具
│   ├── port_scanner.py     # 端口扫描
│   ├── service_detector.py # 服务检测
│   └── vulnerability_scanner.py # 漏洞扫描
├── defense/                # 防御系统
├── controller/             # 远程控制
├── crawler/                # 网络爬虫
├── database/               # 数据库管理
├── memory/                 # 记忆管理
├── prompts/                # 提示词管理
├── system/                 # 操作系统控制
├── tools/                  # 工具和插件
└── utils/                  # 工具函数
```

## 🔧 开发

### 运行测试

```bash
pytest tests/
```

### 构建包

```bash
# Windows
build.bat

# Linux/Mac
./build.sh
```

## 📚 文档

- [快速开始指南](docs/QUICKSTART.md)
- [数据库指南](docs/DATABASE_GUIDE.md)
- [Docker设置](docs/DOCKER_SETUP.md)
- [Ollama设置](docs/OLLAMA_SETUP.md)
- [安全警告](docs/SECURITY_WARNING.md)
- [提示词指南](docs/PROMPT_GUIDE.md)
- [语音指南](docs/SPEECH_GUIDE.md)
- [SQLite设置](docs/SQLITE_SETUP.md)
- [部署指南](DEPLOYMENT.md)

## 🤝 贡献

欢迎贡献！请随时提交Pull Request。

1. Fork 本仓库
2. 创建您的特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交您的更改 (`git commit -m '添加一些AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 打开一个Pull Request

## 📝 许可证

本项目采用 MIT 许可证 - 查看 [LICENSE](LICENSE) 文件了解详情。

## 👤 作者

**赵明俊 (Zhao Mingjun)**

- GitHub: [@iammm0](https://github.com/iammm0)
- Email: wisewater5419@gmail.com

## 🙏 致谢

- 使用 [LangChain](https://github.com/langchain-ai/langchain) 构建
- 由 [Ollama](https://ollama.ai) 提供支持
- CLI使用 [Typer](https://typer.tiangolo.com) 构建
- 使用 [Rich](https://github.com/Textualize/rich) 实现美观的输出

## ⚠️ 免责声明

本工具仅用于教育和授权的安全测试目的。作者和贡献者不对因使用本工具造成的任何误用或损害负责。用户在使用本工具对任何系统进行测试之前，必须确保已获得适当的授权。

---

<div align="center">

**⭐ 如果您觉得这个项目有用，请考虑给它一个星标！⭐**

</div>



