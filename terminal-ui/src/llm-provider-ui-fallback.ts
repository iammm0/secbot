/**
 * 与 server/src/modules/system/llm-provider-registry.ts 保持 id/顺序/名称一致。
 * 当后端未重启或仍返回旧版短列表时，用于补全「切换推理后端」等界面展示。
 */
import type { ProviderApiKeyStatus } from './model-config-types.js';

const FALLBACK: Omit<ProviderApiKeyStatus, 'configured' | 'has_base_url'>[] = [
  { id: 'ollama', name: 'Ollama (本地)', needs_api_key: false, needs_base_url: false },
  { id: 'groq', name: 'Groq', needs_api_key: true, needs_base_url: false },
  { id: 'openrouter', name: 'OpenRouter', needs_api_key: true, needs_base_url: false },
  { id: 'deepseek', name: 'DeepSeek', needs_api_key: true, needs_base_url: true },
  { id: 'openai', name: 'OpenAI', needs_api_key: true, needs_base_url: false },
  { id: 'anthropic', name: 'Anthropic (Claude)', needs_api_key: true, needs_base_url: false },
  { id: 'google', name: 'Google (Gemini)', needs_api_key: true, needs_base_url: false },
  { id: 'zhipu', name: '智谱 (GLM)', needs_api_key: true, needs_base_url: true },
  { id: 'qwen', name: '通义千问 (Qwen)', needs_api_key: true, needs_base_url: true },
  { id: 'moonshot', name: '月之暗面 (Kimi)', needs_api_key: true, needs_base_url: false },
  { id: 'baichuan', name: '百川', needs_api_key: true, needs_base_url: true },
  { id: 'yi', name: '零一万物 (Yi)', needs_api_key: true, needs_base_url: true },
  { id: 'scnet', name: '中国超算互联网 (SCNET)', needs_api_key: true, needs_base_url: true },
  { id: 'hunyuan', name: '腾讯混元', needs_api_key: true, needs_base_url: true },
  { id: 'doubao', name: '字节豆包 (火山方舟)', needs_api_key: true, needs_base_url: true },
  { id: 'spark', name: '讯飞星火', needs_api_key: true, needs_base_url: true },
  { id: 'wenxin', name: '百度文心 (千帆)', needs_api_key: true, needs_base_url: true },
  { id: 'stepfun', name: '阶跃星辰 (StepFun)', needs_api_key: true, needs_base_url: true },
  { id: 'minimax', name: 'MiniMax', needs_api_key: true, needs_base_url: true },
  { id: 'langboat', name: '澜舟 (孟子)', needs_api_key: true, needs_base_url: true },
  { id: 'mianbi', name: '面壁智能', needs_api_key: true, needs_base_url: true },
  { id: 'together', name: 'Together AI', needs_api_key: true, needs_base_url: false },
  { id: 'fireworks', name: 'Fireworks AI', needs_api_key: true, needs_base_url: false },
  { id: 'mistral', name: 'Mistral AI', needs_api_key: true, needs_base_url: false },
  { id: 'cohere', name: 'Cohere', needs_api_key: true, needs_base_url: false },
  { id: 'xai', name: 'xAI (Grok)', needs_api_key: true, needs_base_url: true },
  { id: 'azure_openai', name: 'Azure OpenAI', needs_api_key: true, needs_base_url: true },
  { id: 'custom', name: 'OpenAI 兼容中转', needs_api_key: true, needs_base_url: true },
];

const FALLBACK_IDS = new Set(FALLBACK.map((p) => p.id));

/** 以本地清单为顺序基准合并 API 数据；API 多出的 id 会追加在末尾 */
export function mergeProviderListFromApi(api: ProviderApiKeyStatus[] | undefined): ProviderApiKeyStatus[] {
  const fromApi = api ?? [];
  const apiById = new Map(fromApi.map((p) => [p.id, p]));

  const merged: ProviderApiKeyStatus[] = FALLBACK.map((fb) => {
    const a = apiById.get(fb.id);
    if (a) return a;
    return {
      id: fb.id,
      name: fb.name,
      needs_api_key: fb.needs_api_key,
      configured: false,
      needs_base_url: fb.needs_base_url,
      has_base_url: false,
    };
  });

  const extras = fromApi.filter((p) => !FALLBACK_IDS.has(p.id));
  return extras.length > 0 ? [...merged, ...extras] : merged;
}
