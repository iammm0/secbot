# 推理后端与 API 兼容说明

Secbot 当前的 LLM 调用层只有两条真实执行路径：

- `ollama`：调用 Ollama `/api/chat`。
- 其它 provider：走 OpenAI-compatible `/v1/chat/completions`。

`server/src/modules/system/llm-provider-registry.ts` 维护 provider 清单、环境变量名、默认 Base URL 和配置状态。TUI 的 `/model` 对话框和 `/api/system/config/*` 接口都使用这套注册表。

仓库当前没有移动端或桌面端工程，模型配置只面向后端 API 与 `terminal-ui`。

## 配置优先级

运行时解析顺序大致为：

1. TUI/API 保存的持久化配置。
2. 显式调用参数。
3. 通用环境变量，如 `LLM_PROVIDER`、`LLM_MODEL`、`LLM_API_KEY`、`LLM_BASE_URL`。
4. provider 专用环境变量，如 `DEEPSEEK_API_KEY`、`OLLAMA_MODEL`。
5. 代码默认值。

注意：SystemModule 会把部分配置写入 SQLite / `config.yaml`。如果你在 TUI 里保存过 provider 或 API Key，后续可能优先使用持久化值，而不是 `.env`。

## 切换方式

- TUI：输入 `/model`。
- API：调用 `/api/system/config/provider`、`/api/system/config/api-key`、`/api/system/config/provider-settings`。
- 环境变量：设置 `LLM_PROVIDER` 与对应 provider 的变量。
- npm CLI：运行 `secbot` 后在 TUI 中配置。

## 常用配置

### Ollama

```env
LLM_PROVIDER=ollama
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama3.2
```

### DeepSeek

```env
LLM_PROVIDER=deepseek
DEEPSEEK_API_KEY=sk-your-api-key
DEEPSEEK_MODEL=deepseek-chat
DEEPSEEK_BASE_URL=https://api.deepseek.com
```

### OpenAI

```env
LLM_PROVIDER=openai
OPENAI_API_KEY=sk-your-api-key
OPENAI_MODEL=gpt-4o-mini
OPENAI_BASE_URL=https://api.openai.com
```

### 自定义 OpenAI 兼容中转

```env
LLM_PROVIDER=custom
CUSTOM_API_KEY=sk-your-api-key
CUSTOM_MODEL=your-model
CUSTOM_BASE_URL=https://your-gateway.example.com
```

`OpenAICompatProvider` 会自动请求：

```text
<BASE_URL>/v1/chat/completions
```

因此 Base URL 通常填写网关根地址，不要重复写到 `/v1/chat/completions`。

## Provider 清单

| ID | 名称 | API Key 环境变量 | Base URL 环境变量 | 默认 Base URL |
|----|------|------------------|-------------------|---------------|
| `ollama` | Ollama | 无 | `OLLAMA_BASE_URL` | 无 |
| `groq` | Groq | `GROQ_API_KEY` | `GROQ_BASE_URL` | `https://api.groq.com/openai` |
| `openrouter` | OpenRouter | `OPENROUTER_API_KEY` | `OPENROUTER_BASE_URL` | `https://openrouter.ai/api` |
| `deepseek` | DeepSeek | `DEEPSEEK_API_KEY` | `DEEPSEEK_BASE_URL` | `https://api.deepseek.com` |
| `openai` | OpenAI | `OPENAI_API_KEY` | `OPENAI_BASE_URL` | `https://api.openai.com` |
| `anthropic` | Anthropic (Claude) | `ANTHROPIC_API_KEY` | `ANTHROPIC_BASE_URL` | 无 |
| `google` | Google (Gemini) | `GOOGLE_API_KEY` | `GOOGLE_BASE_URL` | 无 |
| `zhipu` | 智谱 (GLM) | `ZHIPU_API_KEY` | `ZHIPU_BASE_URL` | 无 |
| `qwen` | 通义千问 (Qwen) | `DASHSCOPE_API_KEY` | `DASHSCOPE_BASE_URL` | `https://dashscope.aliyuncs.com/compatible-mode` |
| `moonshot` | 月之暗面 (Kimi) | `MOONSHOT_API_KEY` | `MOONSHOT_BASE_URL` | `https://api.moonshot.cn` |
| `baichuan` | 百川 | `BAICHUAN_API_KEY` | `BAICHUAN_BASE_URL` | 无 |
| `yi` | 零一万物 (Yi) | `YI_API_KEY` | `YI_BASE_URL` | 无 |
| `scnet` | 中国超算互联网 (SCNET) | `SCNET_API_KEY` | `SCNET_BASE_URL` | 无 |
| `hunyuan` | 腾讯混元 | `HUNYUAN_API_KEY` | `HUNYUAN_BASE_URL` | 无 |
| `doubao` | 字节豆包 (火山方舟) | `DOUBAO_API_KEY` | `DOUBAO_BASE_URL` | 无 |
| `spark` | 讯飞星火 | `SPARK_API_KEY` | `SPARK_BASE_URL` | 无 |
| `wenxin` | 百度文心 (千帆) | `WENXIN_API_KEY` | `WENXIN_BASE_URL` | 无 |
| `stepfun` | 阶跃星辰 (StepFun) | `STEPFUN_API_KEY` | `STEPFUN_BASE_URL` | 无 |
| `minimax` | MiniMax | `MINIMAX_API_KEY` | `MINIMAX_BASE_URL` | 无 |
| `langboat` | 澜舟 (孟子) | `LANGBOAT_API_KEY` | `LANGBOAT_BASE_URL` | 无 |
| `mianbi` | 面壁智能 | `MIANBI_API_KEY` | `MIANBI_BASE_URL` | 无 |
| `together` | Together AI | `TOGETHER_API_KEY` | `TOGETHER_BASE_URL` | `https://api.together.xyz` |
| `fireworks` | Fireworks AI | `FIREWORKS_API_KEY` | `FIREWORKS_BASE_URL` | `https://api.fireworks.ai/inference` |
| `mistral` | Mistral AI | `MISTRAL_API_KEY` | `MISTRAL_BASE_URL` | `https://api.mistral.ai` |
| `cohere` | Cohere | `COHERE_API_KEY` | `COHERE_BASE_URL` | 无 |
| `xai` | xAI (Grok) | `XAI_API_KEY` | `XAI_BASE_URL` | 无 |
| `azure_openai` | Azure OpenAI | `AZURE_OPENAI_API_KEY` | `AZURE_OPENAI_BASE_URL` | 无 |
| `custom` | OpenAI 兼容中转 | `CUSTOM_API_KEY` | `CUSTOM_BASE_URL` | 无 |

对于默认 Base URL 为“无”的 provider，当前代码仍会使用 OpenAI-compatible 调用方式。你需要提供一个兼容 `/v1/chat/completions` 的网关地址，否则很可能无法直接调用该厂商原生 API。

## API 配置接口

- `GET /api/system/config`
- `GET /api/system/config/providers`
- `GET /api/system/config/provider/:providerId`
- `POST /api/system/config/provider`
- `POST /api/system/config/provider-settings`
- `POST /api/system/config/api-key`
- `GET /api/system/ollama-models`

`/api/system/ollama-models` 当前是兼容占位实现：它不会实际访问 Ollama，也不会后台拉取模型。请用 `ollama list` 验证本地模型列表，用实际聊天验证模型可用性。

## 注意事项

- `apiKey` 和 `baseUrl` 是后端 DTO 使用的 camelCase 字段名。
- `provider-settings` 使用 `base_url` 字段名。
- Azure OpenAI、Anthropic、Google 等如果使用原生 API 地址，当前 `OpenAICompatProvider` 不一定兼容；建议接入 OpenAI 兼容网关。
- 厂商清单以 `server/src/modules/system/llm-provider-registry.ts` 为准。
