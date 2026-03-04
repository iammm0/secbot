# SecBot 部署指南

## 单二进制部署

SecBot 编译为单一二进制文件，无运行时依赖，部署极其简单。

### 编译

```bash
# 当前平台
go build -o bin/secbot ./cmd/secbot/

# 指定目标平台
GOOS=linux GOARCH=amd64 go build -o bin/secbot-linux-amd64 ./cmd/secbot/
GOOS=darwin GOARCH=arm64 go build -o bin/secbot-darwin-arm64 ./cmd/secbot/
GOOS=windows GOARCH=amd64 go build -o bin/secbot-windows.exe ./cmd/secbot/
```

### 部署到服务器

```bash
# 上传二进制和配置
scp bin/secbot-linux-amd64 user@server:/usr/local/bin/secbot
scp .env.example user@server:/opt/secbot/.env

# 在服务器上
ssh user@server
chmod +x /usr/local/bin/secbot
cd /opt/secbot
# 编辑 .env 配置
secbot
```

## 环境变量

所有配置均通过环境变量或 `.env` 文件提供：

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `LLM_PROVIDER` | LLM 后端 | `deepseek` |
| `MODEL_NAME` | 模型名称 | `deepseek-chat` |
| `DEEPSEEK_API_KEY` | DeepSeek API Key | - |
| `DEEPSEEK_BASE_URL` | DeepSeek API URL | `https://api.deepseek.com` |
| `OLLAMA_URL` | Ollama 服务地址 | `http://localhost:11434` |
| `OLLAMA_MODEL` | Ollama 模型名 | `gemma3:1b` |
| `OPENAI_API_KEY` | OpenAI API Key | - |
| `TEMPERATURE` | 生成温度 | `0.7` |
| `MAX_TOKENS` | 最大 token 数 | `4096` |
| `LOG_LEVEL` | 日志级别 | `INFO` |
| `LOG_FILE` | 日志文件路径 | `logs/agent.log` |
| `VERBOSE` | 详细日志 | `false` |

## 安全建议

- 不要将 `.env` 文件提交到版本控制
- 在生产环境中使用环境变量而非 `.env` 文件
- 限制 SecBot 的网络访问权限
- 在隔离的测试环境中运行安全测试
