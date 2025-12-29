# M-Bot: 安全测试机器人和超级私人助理

M-Bot 是一名专业的安全测试机器人和超级私人助理，由开发者赵明俊创建。其主要功能是作为总接口控制私有云资产和经过授权的主机，提供全方位的安全测试、系统控制和智能助理服务。

## 功能特性

- 🤖 多种智能体设计模式实现
- 💻 命令行界面（CLI），使用Typer构建
- 🎤 完整的语音交互功能（语音转文字、文字转语音）
- 🕷️ AI爬虫机器人：实时捕捉互联网信息
- 💻 操作系统控制模块：文件、进程、系统信息管理
- 📝 提示词链管理：灵活配置智能体提示词
- 💾 SQLite数据库：持久化存储对话历史、提示词链、配置等
- 🐳 Docker Compose：快速启动 ChromaDB 和 Redis 开发环境
- 🔍 网络探测工具：端口扫描、服务识别、漏洞扫描
- ⚔️ 漏洞利用引擎：自动化执行SQL注入、XSS、命令注入、文件上传、路径遍历、SSRF等漏洞利用
- 🔗 自动化攻击链：完整的渗透测试流程自动化（信息收集→漏洞扫描→漏洞利用→后渗透）
- 📦 Payload生成器：自动生成各种攻击payload
- 🎯 后渗透工具：权限提升、持久化、横向移动、数据exfiltration
- ⚔️ 网络攻击测试工具：暴力破解、DoS测试、缓冲区溢出等（仅用于授权的安全测试）
- ⏰ 定时任务调度：支持定时执行渗透测试任务
- 🛡️ 主动防御系统：信息收集、漏洞扫描、网络分析、入侵检测、自动反制
- 📊 安全报告生成：自动生成详细的安全分析报告
- 🔍 内网发现：自动发现内网中的所有目标主机
- 🎯 授权管理：管理对目标主机的合法授权
- 🖥️ 远程控制：在授权后对目标主机进行远程控制（命令执行、文件传输）
- 🔧 丰富的工具和插件支持
- 📝 可扩展的架构设计
- 🎨 美观的终端输出（使用Rich）

## 快速开始

### 1. 安装依赖

```bash
pip install -r requirements.txt
```

### 2. 安装并启动Ollama

确保已安装Ollama并下载所需模型：

```bash
# 安装Ollama（如果未安装）
# 访问 https://ollama.ai 下载安装

# 下载推理模型
ollama pull gpt-oss:20b

# 下载向量嵌入模型（用于文本向量化）
ollama pull nomic-embed-text

# 启动Ollama服务（默认运行在 http://localhost:11434）
```

### 3. 配置环境变量

复制 `.env.example` 为 `.env`：

```bash
cp .env.example .env
```

编辑 `.env` 文件，根据需要调整Ollama配置：
- `OLLAMA_MODEL`: 推理模型（默认: `gpt-oss:20b`）
- `OLLAMA_EMBEDDING_MODEL`: 向量嵌入模型（默认: `nomic-embed-text`）

### 4. 使用CLI应用

#### 查看帮助
```bash
python main.py --help
```

#### 文本聊天
```bash
# 基本聊天
python main.py chat "你好，介绍一下你自己"

# 使用自定义提示词
python main.py chat "解释Python" --prompt "你是一个Python专家，请用简洁的语言解释"

# 使用预定义模板
python main.py chat "写一首诗" --template creative

# 使用提示词链
python main.py chat "分析代码" --prompt-chain expert,technical

# 从文件加载提示词
python main.py chat "回答问题" --prompt-file prompts/my_prompt.txt
```

#### 交互式聊天
```bash
# 基本交互模式
python main.py interactive

# 使用自定义提示词
python main.py interactive --prompt "你是一个友好的助手"
```

#### 语音聊天
```bash
python main.py voice recording.wav
```

#### 系统操作
```bash
# 显示系统信息
python main.py system-info

# 显示系统状态（CPU、内存、磁盘）
python main.py system-status

# 列出进程
python main.py list-processes --filter python

# 执行系统命令
python main.py execute "ls -la"

# 列出文件
python main.py file-list /path/to/dir
```

#### 数据库管理
```bash
# 查看数据库统计信息
python main.py db-stats

# 查看对话历史
python main.py db-history --limit 20

# 查看特定智能体的对话历史
python main.py db-history --agent simple --limit 10

# 清空对话历史（需要确认）
python main.py db-clear --yes
```

#### 查看所有命令
```bash
python main.py --help
```

## 项目结构

```
m-bot/
├── main.py              # CLI应用入口
├── config.py            # 配置管理
├── agents/              # 智能体实现
├── patterns/            # 设计模式
├── tools/               # 工具和插件
├── crawler/             # AI爬虫机器人
├── system/              # 操作系统控制
├── memory/              # 记忆管理
├── utils/               # 工具函数
├── tests/               # 测试文件
├── logs/                # 日志文件
├── requirements.txt     # 依赖项
└── README.md           # 说明文档
```

## 智能体设计模式

本项目支持以下设计模式：

- **ReAct模式**: 推理和行动循环
- **Plan-Execute模式**: 规划-执行模式
- **Multi-Agent模式**: 多智能体协作
- **Tool-Using模式**: 工具使用模式
- **Memory-Augmented模式**: 记忆增强模式

## 开发指南

详见各模块的文档说明。

