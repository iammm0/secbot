# Ollama 设置指南

## 安装Ollama

### Windows
1. 访问 https://ollama.ai/download
2. 下载并安装 Ollama for Windows
3. 安装完成后，Ollama服务会自动启动

### Linux/Mac
```bash
curl -fsSL https://ollama.ai/install.sh | sh
```

## 下载模型

### 1. 下载推理模型

下载 `gpt-oss:20b` 模型用于对话：

```bash
ollama pull gpt-oss:20b
```

### 2. 下载向量嵌入模型

下载向量嵌入模型用于文本向量化（推荐使用 `nomic-embed-text`）：

```bash
ollama pull nomic-embed-text
```

其他可用的向量模型：
- `nomic-embed-text` (推荐，768维)
- `all-minilm` (384维，更小更快)

这可能需要一些时间，取决于你的网络速度。

## 验证安装

检查Ollama是否正常运行：

```bash
# 检查Ollama服务状态
ollama list

# 测试模型
ollama run gpt-oss:20b "你好"
```

## 配置项目

1. 复制 `env.example` 为 `.env`
2. 确认配置：
   ```
   OLLAMA_BASE_URL=http://localhost:11434
   OLLAMA_MODEL=gpt-oss:20b
   OLLAMA_EMBEDDING_MODEL=nomic-embed-text
   ```

## 启动API服务

```bash
python main.py
```

API服务将在 `http://localhost:8000` 启动。

## 常见问题

### Ollama连接失败

如果遇到连接错误，请确保：
1. Ollama服务正在运行：`ollama serve`
2. 检查端口11434是否被占用
3. 确认 `.env` 文件中的 `OLLAMA_BASE_URL` 配置正确

### 模型未找到

如果提示模型不存在：
```bash
# 查看已安装的模型
ollama list

# 如果模型不存在，下载它
ollama pull gpt-oss:20b
```

### 性能优化

对于大模型（如20b），建议：
- 确保有足够的RAM（至少32GB推荐）
- 使用GPU加速（如果支持）
- 调整Ollama的上下文窗口大小

