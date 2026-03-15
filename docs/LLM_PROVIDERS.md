# 推理后端与 API 兼容说明

本文档说明 Secbot 已支持的 LLM 厂商。切换推理后端方式：

- **CLI**：运行 `hackbot model` 或 `secbot model`，按序号或厂商 ID 选择后端与模型，选择结果会写入 SQLite，下次启动生效。
- **TUI**：在对话中输入 `/model` 打开模型配置弹窗，可配置 API Key 与查看当前后端。
- **环境变量**：设置 `LLM_PROVIDER=厂商id`（如 `deepseek`、`stepfun`）。若已用 CLI/TUI 持久化过，则以 SQLite 中的配置优先。

---

## 已支持的厂商

| 厂商 ID | 名称 | 类型 | 说明 |
|--------|------|------|------|
| `ollama` | Ollama (本地) | ollama | 本地部署，无需 API Key |
| `groq` | Groq | OpenAI 兼容 | 极速推理，免费额度 |
| `openrouter` | OpenRouter | OpenAI 兼容 | 多模型聚合，部分免费 |
| `deepseek` | DeepSeek | OpenAI 兼容 | 深度求索 |
| `openai` | OpenAI | OpenAI 兼容 | GPT-4o / o1 / o3-mini |
| `anthropic` | Anthropic (Claude) | 原生 | Claude 系列 |
| `google` | Google (Gemini) | 原生 | Gemini 系列 |
| `zhipu` | 智谱 (GLM) | OpenAI 兼容 | GLM-4 等 |
| `qwen` | 通义千问 (Qwen) | OpenAI 兼容 | 阿里云百炼 |
| `moonshot` | 月之暗面 (Kimi) | OpenAI 兼容 | Moonshot AI |
| `baichuan` | 百川 | OpenAI 兼容 | Baichuan 系列 |
| `yi` | 零一万物 (Yi) | OpenAI 兼容 | Yi 系列 |
| `scnet` | 中国超算互联网 (SCNET) | OpenAI 兼容 | QwQ-32B / DeepSeek-R1 等 |
| `hunyuan` | 腾讯混元 | OpenAI 兼容 | 腾讯云混元大模型 |
| `doubao` | 字节豆包 (火山方舟) | OpenAI 兼容 | 豆包等，模型填 Endpoint ID |
| `spark` | 讯飞星火 | OpenAI 兼容 | 星火认知大模型 |
| `wenxin` | 百度文心 (千帆) | OpenAI 兼容 | 千帆大模型平台 |
| `stepfun` | 阶跃星辰 | OpenAI 兼容 | Step 系列 |
| `minimax` | MiniMax | OpenAI 兼容 | 海螺等，国内 api.minimax.io |
| `langboat` | 澜舟 (孟子) | OpenAI 兼容 | 需配置 Base URL |
| `mianbi` | 面壁智能 | OpenAI 兼容 | 需配置 Base URL |
| `together` | Together AI | OpenAI 兼容 | 开源模型推理 |
| `fireworks` | Fireworks AI | OpenAI 兼容 | 多开源模型 |
| `mistral` | Mistral AI | OpenAI 兼容 | Mistral / Mixture 系列 |
| `cohere` | Cohere | OpenAI 兼容 | Command 等 |
| `xai` | xAI (Grok) | OpenAI 兼容 | 需配置 Base URL |
| `azure_openai` | Azure OpenAI | OpenAI 兼容 | 需配置 Base URL（含资源名与 /openai/v1） |
| `custom` | OpenAI 兼容中转 | OpenAI 兼容 | 自定义 Base URL + API Key |

---

## 配置要点

- **TUI 操作**：输入 `/model` →「配置 API Key」→ 选择厂商。**部分厂商（如 Azure OpenAI、xAI、澜舟、面壁、自定义中转）需先填 API Key，保存后会再提示输入 Base URL**，按顺序完成即可。
- **中国超算互联网 (scnet)**：Base URL 默认 `https://api.scnet.cn/api/llm/v1`，API Key 在 [超算互联网](https://www.scnet.cn/ui/llm/apikeys) 创建。
- **豆包 (doubao)**：模型名填火山方舟的 **Endpoint ID**（如控制台创建的推理端点 ID）。
- **澜舟 / 面壁 / xAI / Azure OpenAI**：无默认 Base URL，需在「配置 API Key」中先填 Key，再在下一步填 Base URL（地址见各厂商文档）。
- **Azure OpenAI**：Base URL 格式一般为 `https://<资源名>.openai.azure.com/openai/v1`，模型名填**部署名**。

以上 Base URL 与模型名以各平台最新文档为准。
