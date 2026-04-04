# 推理后端与 API 兼容说明

Secbot 通过 `server/src/modules/system/` 中的 SystemModule 维护多厂商推理后端注册表，并支持在 CLI、TUI、移动端、桌面端共用同一套配置接口。

## 切换方式

- **TUI**：输入 `/model`
- **API**：调用 `/api/system/config/*`
- **环境变量**：设置 `LLM_PROVIDER` 与对应厂商变量
- **CLI**：`npx secbot` 启动后在交互界面切换

说明：

- 若你已经通过 TUI 把配置持久化到 SQLite，则 SQLite 中的值会优先于环境变量
- 某些厂商既需要 API Key，也需要自定义 Base URL

## 已支持的厂商

| 厂商 ID | 名称 | 类型 | 说明 |
|--------|------|------|------|
| `ollama` | Ollama (本地) | ollama | 本地运行，无需 API Key |
| `groq` | Groq (免费档) | OpenAI 兼容 | 极速推理，免费额度 |
| `openrouter` | OpenRouter (免费模型) | OpenAI 兼容 | 多模型聚合，部分免费 |
| `deepseek` | DeepSeek | OpenAI 兼容 | 默认推荐云端后端 |
| `openai` | OpenAI | OpenAI 兼容 | GPT 系列 |
| `anthropic` | Anthropic (Claude) | 原生 | Claude 系列 |
| `google` | Google (Gemini) | 原生 | Gemini 系列 |
| `zhipu` | 智谱 (GLM) | OpenAI 兼容 | GLM 系列 |
| `qwen` | 通义千问 (Qwen) | OpenAI 兼容 | 阿里云百炼 |
| `moonshot` | 月之暗面 (Kimi) | OpenAI 兼容 | Moonshot AI |
| `baichuan` | 百川 | OpenAI 兼容 | Baichuan 系列 |
| `yi` | 零一万物 (Yi) | OpenAI 兼容 | Yi 系列 |
| `scnet` | 中国超算互联网 (SCNET) | OpenAI 兼容 | QwQ / DeepSeek 等 |
| `hunyuan` | 腾讯混元 (Hunyuan) | OpenAI 兼容 | 腾讯云混元 |
| `doubao` | 字节豆包 (火山方舟) | OpenAI 兼容 | 模型名填 Endpoint ID |
| `spark` | 讯飞星火 (Spark) | OpenAI 兼容 | 星火认知大模型 |
| `wenxin` | 百度文心 (千帆) | OpenAI 兼容 | 千帆平台 |
| `stepfun` | 阶跃星辰 (StepFun) | OpenAI 兼容 | Step 系列 |
| `minimax` | MiniMax | OpenAI 兼容 | 海螺等 |
| `langboat` | 澜舟 (孟子) | OpenAI 兼容 | 需配置 Base URL |
| `mianbi` | 面壁智能 | OpenAI 兼容 | 需配置 Base URL |
| `together` | Together AI | OpenAI 兼容 | 开源模型推理 |
| `fireworks` | Fireworks AI | OpenAI 兼容 | 多开源模型 |
| `mistral` | Mistral AI | OpenAI 兼容 | Mistral 系列 |
| `cohere` | Cohere | OpenAI 兼容 | Command 系列 |
| `xai` | xAI (Grok) | OpenAI 兼容 | 需配置 Base URL |
| `azure_openai` | Azure OpenAI | OpenAI 兼容 | 需配置 Base URL |
| `custom` | OpenAI 兼容中转 | OpenAI 兼容 | 自定义 Base URL + API Key |

## 推荐使用方式

### 1. DeepSeek

```env
LLM_PROVIDER=deepseek
DEEPSEEK_API_KEY=sk-your-api-key
DEEPSEEK_MODEL=deepseek-reasoner
```

### 2. Ollama

```env
LLM_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=gemma3:1b
OLLAMA_EMBEDDING_MODEL=nomic-embed-text
```

## `/model` 与 API 配置行为

### `/model`

终端 UI 中输入 `/model` 后，可以：

- 查看当前后端
- 切换厂商
- 设置 API Key
- 设置 Base URL
- 设置默认模型

### 对应后端接口

- `GET /api/system/config`
- `GET /api/system/config/providers`
- `GET /api/system/config/provider/{provider_id}`
- `POST /api/system/config/api-key`
- `POST /api/system/config/provider`
- `POST /api/system/config/provider-settings`
- `GET /api/system/ollama-models`

## 特殊说明

### 1. 需要 Base URL 的厂商

以下厂商通常需要手动补充 Base URL：

- `langboat`
- `mianbi`
- `xai`
- `azure_openai`
- `custom`

### 2. 豆包

`doubao` 的"模型名"一般填火山方舟中的 **Endpoint ID**，不是自然语言模型别名。

### 3. Azure OpenAI

常见 Base URL 形式：

```text
https://<resource-name>.openai.azure.com/openai/v1
```

模型字段通常填写**部署名**而非原始模型名。

### 4. Ollama

`/api/system/ollama-models` 会检查本地服务是否在线，并在默认模型缺失时尝试后台拉取。

## 注意事项

- 厂商侧模型与 Base URL 可能会变化，文档只保证与当前代码的配置逻辑一致
- 如果要看默认模型建议值，请以 `server/src/modules/system/system.service.ts` 中的 `PROVIDER_REGISTRY` 为准
