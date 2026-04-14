/**
 * 与 docs/LLM_PROVIDERS.md 对齐的推理后端注册表，供 listProviders 与默认 Base URL 解析共用。
 * API Key / Base URL 在 SQLite 中的键名为 `{id}_api_key`、`{id}_base_url`；环境变量见各字段。
 */
/** 厂商分组类别 */
export type LlmProviderGroup = 'overseas' | 'china' | 'relay' | 'local';

export interface LlmProviderRegistryEntry {
  id: string;
  name: string;
  needsApiKey: boolean;
  /** 是否通常需要用户填写 Base URL（中转、Azure、部分国内厂商等） */
  needsBaseUrl: boolean;
  /** 分组: overseas=海外原生, china=国内原生, relay=中转/兼容, local=本地推理 */
  group: LlmProviderGroup;
  /** 中转类标注兼容的协议系列，如 'OpenAI 兼容' */
  compatHint?: string;
  /** 检测「已配置 Key」时读取的环境变量（大写） */
  apiKeyEnv?: string;
  /** 检测「已配置 Base URL」时读取的环境变量 */
  baseUrlEnv: string;
  /**
   * OpenAI 兼容网关根地址（不含 /v1/chat/completions；与 OpenAICompatProvider 拼接为 baseUrl + /v1/chat/completions）。
   * 未设置时表示需用户自行填写 Base URL。
   */
  defaultOpenAICompatBaseUrl?: string;
}

/** 顺序与文档表格一致，便于对照 */
export const LLM_PROVIDER_REGISTRY: LlmProviderRegistryEntry[] = [
  {
    id: 'ollama',
    name: 'Ollama (本地)',
    needsApiKey: false,
    needsBaseUrl: false,
    group: 'local',
    baseUrlEnv: 'OLLAMA_BASE_URL',
    defaultOpenAICompatBaseUrl: undefined,
  },
  {
    id: 'groq',
    name: 'Groq',
    needsApiKey: true,
    needsBaseUrl: false,
    group: 'relay',
    compatHint: 'OpenAI 兼容',
    apiKeyEnv: 'GROQ_API_KEY',
    baseUrlEnv: 'GROQ_BASE_URL',
    defaultOpenAICompatBaseUrl: 'https://api.groq.com/openai',
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    needsApiKey: true,
    needsBaseUrl: false,
    group: 'relay',
    compatHint: 'OpenAI 兼容',
    apiKeyEnv: 'OPENROUTER_API_KEY',
    baseUrlEnv: 'OPENROUTER_BASE_URL',
    defaultOpenAICompatBaseUrl: 'https://openrouter.ai/api',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    needsApiKey: true,
    /** 官方 API 域名为固定公开地址，中转/自建时才需改 Base URL */
    needsBaseUrl: false,
    group: 'china',
    apiKeyEnv: 'DEEPSEEK_API_KEY',
    baseUrlEnv: 'DEEPSEEK_BASE_URL',
    defaultOpenAICompatBaseUrl: 'https://api.deepseek.com',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    needsApiKey: true,
    needsBaseUrl: false,
    group: 'overseas',
    apiKeyEnv: 'OPENAI_API_KEY',
    baseUrlEnv: 'OPENAI_BASE_URL',
    defaultOpenAICompatBaseUrl: 'https://api.openai.com',
  },
  {
    id: 'anthropic',
    name: 'Anthropic (Claude)',
    needsApiKey: true,
    needsBaseUrl: false,
    group: 'overseas',
    apiKeyEnv: 'ANTHROPIC_API_KEY',
    baseUrlEnv: 'ANTHROPIC_BASE_URL',
    defaultOpenAICompatBaseUrl: undefined,
  },
  {
    id: 'google',
    name: 'Google (Gemini)',
    needsApiKey: true,
    needsBaseUrl: false,
    group: 'overseas',
    apiKeyEnv: 'GOOGLE_API_KEY',
    baseUrlEnv: 'GOOGLE_BASE_URL',
    defaultOpenAICompatBaseUrl: undefined,
  },
  {
    id: 'zhipu',
    name: '智谱 (GLM)',
    needsApiKey: true,
    needsBaseUrl: true,
    group: 'china',
    apiKeyEnv: 'ZHIPU_API_KEY',
    baseUrlEnv: 'ZHIPU_BASE_URL',
    defaultOpenAICompatBaseUrl: undefined,
  },
  {
    id: 'qwen',
    name: '通义千问 (Qwen)',
    needsApiKey: true,
    needsBaseUrl: false,
    group: 'china',
    apiKeyEnv: 'DASHSCOPE_API_KEY',
    baseUrlEnv: 'DASHSCOPE_BASE_URL',
    defaultOpenAICompatBaseUrl: 'https://dashscope.aliyuncs.com/compatible-mode',
  },
  {
    id: 'moonshot',
    name: '月之暗面 (Kimi)',
    needsApiKey: true,
    needsBaseUrl: false,
    group: 'china',
    apiKeyEnv: 'MOONSHOT_API_KEY',
    baseUrlEnv: 'MOONSHOT_BASE_URL',
    defaultOpenAICompatBaseUrl: 'https://api.moonshot.cn',
  },
  {
    id: 'baichuan',
    name: '百川',
    needsApiKey: true,
    needsBaseUrl: true,
    group: 'china',
    apiKeyEnv: 'BAICHUAN_API_KEY',
    baseUrlEnv: 'BAICHUAN_BASE_URL',
    defaultOpenAICompatBaseUrl: undefined,
  },
  {
    id: 'yi',
    name: '零一万物 (Yi)',
    needsApiKey: true,
    needsBaseUrl: true,
    group: 'china',
    apiKeyEnv: 'YI_API_KEY',
    baseUrlEnv: 'YI_BASE_URL',
    defaultOpenAICompatBaseUrl: undefined,
  },
  {
    id: 'scnet',
    name: '中国超算互联网 (SCNET)',
    needsApiKey: true,
    needsBaseUrl: true,
    group: 'china',
    apiKeyEnv: 'SCNET_API_KEY',
    baseUrlEnv: 'SCNET_BASE_URL',
    defaultOpenAICompatBaseUrl: undefined,
  },
  {
    id: 'hunyuan',
    name: '腾讯混元',
    needsApiKey: true,
    needsBaseUrl: true,
    group: 'china',
    apiKeyEnv: 'HUNYUAN_API_KEY',
    baseUrlEnv: 'HUNYUAN_BASE_URL',
    defaultOpenAICompatBaseUrl: undefined,
  },
  {
    id: 'doubao',
    name: '字节豆包 (火山方舟)',
    needsApiKey: true,
    needsBaseUrl: true,
    group: 'china',
    apiKeyEnv: 'DOUBAO_API_KEY',
    baseUrlEnv: 'DOUBAO_BASE_URL',
    defaultOpenAICompatBaseUrl: undefined,
  },
  {
    id: 'spark',
    name: '讯飞星火',
    needsApiKey: true,
    needsBaseUrl: true,
    group: 'china',
    apiKeyEnv: 'SPARK_API_KEY',
    baseUrlEnv: 'SPARK_BASE_URL',
    defaultOpenAICompatBaseUrl: undefined,
  },
  {
    id: 'wenxin',
    name: '百度文心 (千帆)',
    needsApiKey: true,
    needsBaseUrl: true,
    group: 'china',
    apiKeyEnv: 'WENXIN_API_KEY',
    baseUrlEnv: 'WENXIN_BASE_URL',
    defaultOpenAICompatBaseUrl: undefined,
  },
  {
    id: 'stepfun',
    name: '阶跃星辰 (StepFun)',
    needsApiKey: true,
    needsBaseUrl: true,
    group: 'china',
    apiKeyEnv: 'STEPFUN_API_KEY',
    baseUrlEnv: 'STEPFUN_BASE_URL',
    defaultOpenAICompatBaseUrl: undefined,
  },
  {
    id: 'minimax',
    name: 'MiniMax',
    needsApiKey: true,
    needsBaseUrl: true,
    group: 'china',
    apiKeyEnv: 'MINIMAX_API_KEY',
    baseUrlEnv: 'MINIMAX_BASE_URL',
    defaultOpenAICompatBaseUrl: undefined,
  },
  {
    id: 'langboat',
    name: '澜舟 (孟子)',
    needsApiKey: true,
    needsBaseUrl: true,
    group: 'china',
    apiKeyEnv: 'LANGBOAT_API_KEY',
    baseUrlEnv: 'LANGBOAT_BASE_URL',
    defaultOpenAICompatBaseUrl: undefined,
  },
  {
    id: 'mianbi',
    name: '面壁智能',
    needsApiKey: true,
    needsBaseUrl: true,
    group: 'china',
    apiKeyEnv: 'MIANBI_API_KEY',
    baseUrlEnv: 'MIANBI_BASE_URL',
    defaultOpenAICompatBaseUrl: undefined,
  },
  {
    id: 'together',
    name: 'Together AI',
    needsApiKey: true,
    needsBaseUrl: false,
    group: 'relay',
    compatHint: 'OpenAI 兼容',
    apiKeyEnv: 'TOGETHER_API_KEY',
    baseUrlEnv: 'TOGETHER_BASE_URL',
    defaultOpenAICompatBaseUrl: 'https://api.together.xyz',
  },
  {
    id: 'fireworks',
    name: 'Fireworks AI',
    needsApiKey: true,
    needsBaseUrl: false,
    group: 'relay',
    compatHint: 'OpenAI 兼容',
    apiKeyEnv: 'FIREWORKS_API_KEY',
    baseUrlEnv: 'FIREWORKS_BASE_URL',
    defaultOpenAICompatBaseUrl: 'https://api.fireworks.ai/inference',
  },
  {
    id: 'mistral',
    name: 'Mistral AI',
    needsApiKey: true,
    needsBaseUrl: false,
    group: 'overseas',
    apiKeyEnv: 'MISTRAL_API_KEY',
    baseUrlEnv: 'MISTRAL_BASE_URL',
    defaultOpenAICompatBaseUrl: 'https://api.mistral.ai',
  },
  {
    id: 'cohere',
    name: 'Cohere',
    needsApiKey: true,
    needsBaseUrl: false,
    group: 'overseas',
    apiKeyEnv: 'COHERE_API_KEY',
    baseUrlEnv: 'COHERE_BASE_URL',
    defaultOpenAICompatBaseUrl: undefined,
  },
  {
    id: 'xai',
    name: 'xAI (Grok)',
    needsApiKey: true,
    needsBaseUrl: true,
    group: 'overseas',
    apiKeyEnv: 'XAI_API_KEY',
    baseUrlEnv: 'XAI_BASE_URL',
    defaultOpenAICompatBaseUrl: undefined,
  },
  {
    id: 'azure_openai',
    name: 'Azure OpenAI',
    needsApiKey: true,
    needsBaseUrl: true,
    group: 'relay',
    compatHint: 'OpenAI 兼容',
    apiKeyEnv: 'AZURE_OPENAI_API_KEY',
    baseUrlEnv: 'AZURE_OPENAI_BASE_URL',
    defaultOpenAICompatBaseUrl: undefined,
  },
  {
    id: 'custom',
    name: 'OpenAI 兼容中转',
    needsApiKey: true,
    needsBaseUrl: true,
    group: 'relay',
    compatHint: 'OpenAI 兼容',
    apiKeyEnv: 'CUSTOM_API_KEY',
    baseUrlEnv: 'CUSTOM_BASE_URL',
    defaultOpenAICompatBaseUrl: undefined,
  },
];

const REGISTRY_BY_ID = new Map(LLM_PROVIDER_REGISTRY.map((e) => [e.id, e]));

/** 是否在注册表中（含 ollama、custom 等） */
export function getLlmProviderMeta(id: string): LlmProviderRegistryEntry | undefined {
  return REGISTRY_BY_ID.get(id.toLowerCase());
}

/** 供 createLLM 解析 OpenAI 兼容默认网关 */
export function getDefaultOpenAICompatBaseUrl(providerId: string): string | undefined {
  return REGISTRY_BY_ID.get(providerId.toLowerCase())?.defaultOpenAICompatBaseUrl;
}

/** 当未设置 LLM_API_KEY 时，回退读取各厂商文档中的标准环境变量 */
export function getEnvBackedApiKey(providerId: string): string {
  const entry = REGISTRY_BY_ID.get(providerId.toLowerCase());
  const envName = entry?.apiKeyEnv;
  if (!envName) return '';
  return (process.env[envName] ?? '').trim();
}

/** 当未设置 LLM_BASE_URL 时，回退读取各厂商的 Base URL 环境变量 */
export function getEnvBackedBaseUrl(providerId: string): string {
  const entry = REGISTRY_BY_ID.get(providerId.toLowerCase());
  const envName = entry?.baseUrlEnv;
  if (!envName) return '';
  return (process.env[envName] ?? '').trim();
}
