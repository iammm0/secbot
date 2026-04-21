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
ollama pull llama3.2
```

如果你希望更强的本地模型，也可以改成自己常用的模型名，并同步更新 `.env` 里的 `OLLAMA_MODEL`。

### 2. 向量嵌入模型

```bash
ollama pull nomic-embed-text
```

## 三、验证服务是否可用

```bash
ollama list
ollama run llama3.2 "你好"
```

如果 `ollama list` 能返回模型列表，说明本地服务基本可用。

## 四、配置 Secbot

在项目根目录创建 `.env`：

```env
LLM_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.2
OLLAMA_EMBEDDING_MODEL=nomic-embed-text
```

说明：

- 当前仓库没有根目录 `env.example` / `.env.example`
- 请直接手动创建 `.env`

## 五、启动方式

### 完整启动（后端 + TUI）

```bash
npm run start:stack
```

### 仅启动后端 API

```bash
# 开发模式
npm run dev

# 生产模式
npm start
```

后端默认监听端口 `8000`，可通过环境变量 `PORT` 修改。

## 六、在 UI 中检查 Ollama

TUI 的 `/model` 对话框会调用：

```text
GET /api/system/ollama-models
```

当前 TypeScript 后端保留了这个兼容接口，但实现仍是占位：不会实际访问 Ollama，也不会后台拉取模型。返回内容通常包含空 `models` 和说明性的 `error`。

实际聊天时，`OllamaProvider` 会直接调用：

```text
<OLLAMA_BASE_URL>/api/chat
```

因此请用 `ollama list` 验证模型列表，用 TUI 里的实际对话验证模型调用是否正常。

## 七、常见问题

### 1. 无法连接 Ollama

请检查：

- Ollama 应用或 `ollama serve` 是否已启动
- `.env` 中的 `OLLAMA_BASE_URL` 是否正确
- 11434 端口是否被防火墙或代理影响

### 2. 模型不存在

```bash
ollama list
ollama pull llama3.2
```

如果你把 `OLLAMA_MODEL` 改成了别的名字，也要先手动 `pull` 对应模型。

### 3. 模型太慢

可尝试：

- 换更小的模型
- 降低上下文大小
- 使用有 GPU 支持的环境

### 4. `/model` 里看不到模型列表

先直接访问：

```bash
curl http://127.0.0.1:8000/api/system/ollama-models
```

如果接口返回了 `error` 字段，先看错误文本。当前版本中它可能只是说明模型列表查询尚未接入真实 Ollama；这不一定代表聊天调用不可用。
