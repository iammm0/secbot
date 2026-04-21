# Ollama 设置指南

本文档说明如何让 Secbot 使用本地 Ollama 作为推理后端。

## 一、安装 Ollama

### Windows

1. 打开 [https://ollama.ai/download](https://ollama.ai/download)
2. 下载并安装 Windows 版本
3. 安装后通常会自动拉起本地服务

### Linux / macOS

```bash
curl -fsSL https://ollama.ai/install.sh | sh
```

## 二、拉取模型

### 1. 推理模型

当前代码默认使用：

```bash
ollama pull gemma3:1b
```

如果你希望更强的本地模型，也可以改成自己常用的模型名，并在 `/model`、`secbot model` 或 `.env` 里同步更新 `OLLAMA_MODEL`。

### 2. 向量嵌入模型

```bash
ollama pull nomic-embed-text
```

## 三、验证服务是否可用

```bash
ollama list
ollama run gemma3:1b "你好"
```

如果 `ollama list` 能返回模型列表，说明本地服务基本可用。

## 四、配置 Secbot

推荐直接在程序内配置：

```bash
secbot model
```

或启动交互 CLI 后输入：

```text
/model
```

如果你需要无人值守启动或环境变量覆盖，也可以在项目根目录或发布包目录创建 `.env`：

```env
LLM_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=gemma3:1b
OLLAMA_EMBEDDING_MODEL=nomic-embed-text
```

说明：

- 根目录 `env.example` 说明 `.env` 是可选项
- `.env.backup` 是完整变量参考，可复制为 `.env` 后按需取消注释

## 五、启动方式

### 完整终端模式

```bash
python scripts/main.py
# 或
uv run secbot
```

### 仅启动后端 API

```bash
secbot server
# 或源码仓中
uv run secbot server
# 或
python -m router.main
```

## 六、在客户端中检查 Ollama

当前 CLI 与外部客户端都会调用：

```text
GET /api/system/ollama-models
```

这个接口会：

- 检测 `OLLAMA_BASE_URL` 是否可连通
- 返回本地可用模型列表
- 若默认模型缺失，尝试后台拉取并返回 `pulling_model`

因此当你在 `/model` 或自定义客户端中看到 Ollama 模型列表时，数据来源就是这里。

## 七、常见问题

### 1. 无法连接 Ollama

请检查：

- Ollama 应用或 `ollama serve` 是否已启动
- `/model` / `secbot model` 中保存的 Ollama 地址是否正确；若使用 `.env`，检查 `OLLAMA_BASE_URL`
- 11434 端口是否被防火墙或代理影响

### 2. 模型不存在

```bash
ollama list
ollama pull gemma3:1b
```

如果你把 `OLLAMA_MODEL` 改成了别的名字，也要先手动 `pull` 对应模型。

### 3. 模型太慢

可尝试：

- 换更小的模型
- 降低上下文大小
- 使用有 GPU 支持的环境

### 4. 客户端里看不到模型列表

先直接访问：

```bash
curl http://127.0.0.1:8000/api/system/ollama-models
```

如果接口返回了 `error` 字段，说明是 Ollama 服务或地址问题，而不是客户端渲染问题。
