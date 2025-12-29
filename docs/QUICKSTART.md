# 快速启动指南

## 1. 安装依赖

```bash
pip install -r requirements.txt
```

## 2. 安装并启动Ollama

确保已安装Ollama并下载了所需模型：

```bash
# 安装Ollama（如果未安装）
# 访问 https://ollama.ai 下载安装

# 下载推理模型
ollama pull gpt-oss:20b

# 下载向量嵌入模型（用于文本向量化）
ollama pull nomic-embed-text

# 启动Ollama服务（默认运行在 http://localhost:11434）
# Ollama通常会自动启动，如果没有，运行：
ollama serve
```

## 3. 配置环境变量

复制 `env.example` 为 `.env`：

```bash
# Windows
copy env.example .env

# Linux/Mac
cp env.example .env
```

编辑 `.env` 文件，根据需要调整Ollama配置：
- `OLLAMA_BASE_URL`: Ollama服务地址（默认: http://localhost:11434）
- `OLLAMA_MODEL`: 使用的模型名称（默认: gpt-oss:20b）
- `OLLAMA_EMBEDDING_MODEL`: 向量嵌入模型（默认: nomic-embed-text）

## 4. 使用CLI应用

### 查看帮助

```bash
python main.py --help
```

### 文本聊天

```bash
# 基本用法
python main.py chat "你好，介绍一下你自己"

# 指定智能体类型
python main.py chat "解释一下ReAct模式" --agent react

# 保存响应到文件
python main.py chat "写一首诗" --output response.txt
```

### 交互式聊天

```bash
# 启动交互模式
python main.py interactive

# 使用指定智能体
python main.py interactive --agent react

# 启用语音模式（需要额外配置）
python main.py interactive --voice
```

### 语音功能

#### 语音转文字

```bash
python main.py transcribe recording.wav

# 保存转录结果
python main.py transcribe recording.wav --output transcript.txt
```

#### 文字转语音

```bash
python main.py synthesize "你好，这是测试"

# 指定输出文件
python main.py synthesize "你好，这是测试" --output speech.wav

# 指定语言
python main.py synthesize "Hello, this is a test" --language en
```

#### 语音聊天

```bash
# 完整语音对话流程
python main.py voice recording.wav

# 只返回文字，不生成语音
python main.py voice recording.wav --text-only

# 保存语音响应
python main.py voice recording.wav --output response.wav
```

### 其他命令

#### 列出可用智能体

```bash
python main.py list-agents
```

#### 清空对话历史

```bash
# 清空所有智能体的记忆
python main.py clear

# 清空指定智能体的记忆
python main.py clear --agent simple
```

## 5. 项目结构说明

```
m-bot/
├── main.py              # CLI应用入口
├── config.py            # 配置管理
├── agents/              # 智能体实现
│   ├── base.py          # 基础智能体类
│   └── simple.py        # 简单智能体
├── patterns/            # 设计模式
│   └── react.py         # ReAct模式
├── tools/               # 工具和插件
│   ├── base.py          # 基础工具类
│   └── web_search.py    # 网络搜索工具
├── memory/              # 记忆管理
├── utils/               # 工具函数
│   ├── logger.py        # 日志配置
│   ├── embeddings.py    # 向量嵌入
│   └── speech.py        # 语音处理
├── tests/               # 测试文件
├── requirements.txt     # 依赖项
├── env.example          # 环境变量示例
└── README.md           # 项目说明
```

## 6. 开发新智能体

1. 继承 `BaseAgent` 类
2. 实现 `process` 方法
3. 在 `main.py` 中注册新智能体

示例：

```python
from agents.base import BaseAgent

class MyAgent(BaseAgent):
    async def process(self, user_input: str, **kwargs) -> str:
        # 你的处理逻辑
        return "响应"
```

然后在 `main.py` 的 `agents` 字典中添加：
```python
agents["myagent"] = MyAgent(name="MyAgent")
```

## 7. 添加新工具

1. 继承 `BaseTool` 类
2. 实现 `execute` 方法
3. 在智能体中使用工具

## 注意事项

- 确保已配置Ollama并下载了所需模型
- 首次使用Whisper会自动下载模型（约500MB-3GB）
- 建议使用虚拟环境：`python -m venv venv`
- 语音功能需要安装额外的依赖（见SPEECH_GUIDE.md）
