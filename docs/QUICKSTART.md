# SecBot 快速启动指南

## 前置条件

- **Go 1.21+**：[安装 Go](https://go.dev/dl/)
- **LLM 后端**（三选一）：
  - DeepSeek API Key（推荐，性价比高）
  - OpenAI API Key
  - 本地 Ollama 服务

## 第一步：获取代码

```bash
git clone https://github.com/yourusername/secbot.git
cd secbot
git checkout refactor-by-go
```

## 第二步：配置环境

```bash
cp .env.example .env
```

编辑 `.env` 文件，根据你选择的 LLM 后端配置：

### 使用 DeepSeek（推荐）

```env
LLM_PROVIDER=deepseek
MODEL_NAME=deepseek-chat
DEEPSEEK_API_KEY=your-key-here
DEEPSEEK_BASE_URL=https://api.deepseek.com
```

### 使用 Ollama（本地）

```env
LLM_PROVIDER=ollama
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=gemma3:1b
```

### 使用 OpenAI

```env
LLM_PROVIDER=openai
MODEL_NAME=gpt-4o
OPENAI_API_KEY=your-key-here
```

## 第三步：运行

```bash
# 直接运行（开发模式）
go run ./cmd/secbot/

# 或编译后运行（生产模式，更快）
go build -o bin/secbot ./cmd/secbot/
./bin/secbot
```

## 第四步：开始使用

进入交互界面后，直接输入自然语言指令：

```
secbot> 你好
secbot> 扫描 scanme.nmap.org 的常见端口
secbot> 检查 github.com 的 SSL 证书安全性
secbot> /tools
secbot> /help
```

## 使用 Makefile

```bash
make build    # 编译
make run      # 运行
make test     # 测试
make tidy     # 整理依赖
make clean    # 清理构建产物
```

## 跨平台编译

```bash
make build-linux     # Linux amd64
make build-darwin    # macOS arm64
make build-windows   # Windows amd64
make build-all       # 全平台
```

## 常见问题

### Q: 提示"API key is required"

检查 `.env` 中对应 provider 的 API Key 是否正确配置。

### Q: Ollama 连接失败

确保 Ollama 服务正在运行：`ollama serve`，并且模型已下载：`ollama pull gemma3:1b`。

### Q: 编译失败

确保 Go 版本 >= 1.21，运行 `go mod tidy` 更新依赖。
