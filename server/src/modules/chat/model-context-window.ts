/**
 * 模型上下文窗口静态表 + 粗略 token 估算。
 *
 * 设计取舍：不引入分词器依赖（避免每个 provider 一份 tokenizer），
 * 用基于字节/字符的粗估给 ContextManager 做预算切片，
 * 实际 prompt 长度由 provider 端再次裁剪兜底。
 */

export interface ModelWindow {
  /** 模型总上下文窗口（input + output） */
  context: number;
  /** 给输出预留 */
  reserveForOutput: number;
  /** 给 system + 工具描述等固定开销预留 */
  reserveForSystem: number;
}

const DEFAULT_WINDOW: ModelWindow = {
  context: 8_192,
  reserveForOutput: 1_500,
  reserveForSystem: 1_500,
};

/** 表中 key 已经小写化，匹配时做大小写规整 */
const MODEL_WINDOW_TABLE: Record<string, ModelWindow> = {
  // OpenAI
  'gpt-4o': { context: 128_000, reserveForOutput: 4_000, reserveForSystem: 2_000 },
  'gpt-4o-mini': { context: 128_000, reserveForOutput: 4_000, reserveForSystem: 2_000 },
  'gpt-4-turbo': { context: 128_000, reserveForOutput: 4_000, reserveForSystem: 2_000 },
  'gpt-4': { context: 8_192, reserveForOutput: 1_500, reserveForSystem: 1_500 },
  'gpt-3.5-turbo': { context: 16_385, reserveForOutput: 2_000, reserveForSystem: 1_500 },
  'o1': { context: 128_000, reserveForOutput: 32_000, reserveForSystem: 2_000 },
  'o1-mini': { context: 128_000, reserveForOutput: 16_000, reserveForSystem: 2_000 },
  'o3-mini': { context: 200_000, reserveForOutput: 32_000, reserveForSystem: 2_000 },

  // Anthropic
  'claude-sonnet-4': { context: 200_000, reserveForOutput: 8_000, reserveForSystem: 2_000 },
  'claude-opus-4': { context: 200_000, reserveForOutput: 8_000, reserveForSystem: 2_000 },
  'claude-3-5-sonnet': { context: 200_000, reserveForOutput: 8_000, reserveForSystem: 2_000 },
  'claude-3-7-sonnet': { context: 200_000, reserveForOutput: 8_000, reserveForSystem: 2_000 },
  'claude-3-opus': { context: 200_000, reserveForOutput: 4_000, reserveForSystem: 2_000 },
  'claude-3-haiku': { context: 200_000, reserveForOutput: 4_000, reserveForSystem: 2_000 },

  // DeepSeek
  'deepseek-chat': { context: 128_000, reserveForOutput: 4_000, reserveForSystem: 2_000 },
  'deepseek-reasoner': { context: 128_000, reserveForOutput: 8_000, reserveForSystem: 2_000 },
  'deepseek-coder': { context: 128_000, reserveForOutput: 4_000, reserveForSystem: 2_000 },

  // Qwen
  'qwen-max': { context: 32_768, reserveForOutput: 2_000, reserveForSystem: 1_500 },
  'qwen-plus': { context: 131_072, reserveForOutput: 4_000, reserveForSystem: 2_000 },
  'qwen-turbo': { context: 1_000_000, reserveForOutput: 8_000, reserveForSystem: 2_000 },
  'qwen2.5': { context: 131_072, reserveForOutput: 4_000, reserveForSystem: 2_000 },

  // Moonshot / Kimi
  'moonshot-v1-8k': { context: 8_192, reserveForOutput: 1_500, reserveForSystem: 1_500 },
  'moonshot-v1-32k': { context: 32_768, reserveForOutput: 2_000, reserveForSystem: 1_500 },
  'moonshot-v1-128k': { context: 128_000, reserveForOutput: 4_000, reserveForSystem: 2_000 },
  'moonshot-v1-1m': { context: 1_000_000, reserveForOutput: 8_000, reserveForSystem: 2_000 },

  // GLM / 智谱
  'glm-4': { context: 128_000, reserveForOutput: 4_000, reserveForSystem: 2_000 },
  'glm-4-plus': { context: 128_000, reserveForOutput: 4_000, reserveForSystem: 2_000 },

  // Google Gemini
  'gemini-1.5-pro': { context: 1_000_000, reserveForOutput: 8_000, reserveForSystem: 2_000 },
  'gemini-1.5-flash': { context: 1_000_000, reserveForOutput: 8_000, reserveForSystem: 2_000 },
  'gemini-2.0-flash': { context: 1_000_000, reserveForOutput: 8_000, reserveForSystem: 2_000 },

  // Llama / Ollama 常见
  'llama3.2': { context: 8_192, reserveForOutput: 1_500, reserveForSystem: 1_500 },
  'llama3.1': { context: 128_000, reserveForOutput: 4_000, reserveForSystem: 2_000 },
  'llama3': { context: 8_192, reserveForOutput: 1_500, reserveForSystem: 1_500 },
  'mistral': { context: 32_768, reserveForOutput: 2_000, reserveForSystem: 1_500 },
  'mixtral': { context: 32_768, reserveForOutput: 2_000, reserveForSystem: 1_500 },
  'qwen2': { context: 32_768, reserveForOutput: 2_000, reserveForSystem: 1_500 },

  // xAI Grok
  'grok-2': { context: 131_072, reserveForOutput: 4_000, reserveForSystem: 2_000 },
  'grok-beta': { context: 131_072, reserveForOutput: 4_000, reserveForSystem: 2_000 },
};

const TABLE_KEYS_BY_LENGTH_DESC = Object.keys(MODEL_WINDOW_TABLE).sort(
  (a, b) => b.length - a.length,
);

export function getModelWindow(modelName?: string | null): ModelWindow {
  if (!modelName) return DEFAULT_WINDOW;
  const lower = modelName.toLowerCase().trim();
  if (!lower) return DEFAULT_WINDOW;
  if (MODEL_WINDOW_TABLE[lower]) return MODEL_WINDOW_TABLE[lower];
  /** 子串匹配（如 "claude-3-5-sonnet-20241022" -> "claude-3-5-sonnet"），优先匹配最长键 */
  for (const key of TABLE_KEYS_BY_LENGTH_DESC) {
    if (lower.startsWith(key) || lower.includes(key)) {
      return MODEL_WINDOW_TABLE[key];
    }
  }
  return DEFAULT_WINDOW;
}

/**
 * 粗略估算 token 数：
 * - ASCII：~1 token / 4 char
 * - 非 ASCII（CJK 等）：每个字符额外 +0.5 token 修正，更贴近 CJK 实际 token 比
 * 真实 tokenizer 一般在 ±30% 内，足够做预算切片。
 */
export function approxTokens(text: string): number {
  if (!text) return 0;
  let nonAscii = 0;
  for (let i = 0; i < text.length; i++) {
    if (text.charCodeAt(i) > 127) nonAscii++;
  }
  const base = Math.ceil(text.length / 4);
  const cjkAdj = Math.ceil(nonAscii * 0.5);
  return Math.max(1, base + cjkAdj);
}

/** 提示在 prompt context 区块上可用的 token 预算（去掉输出/系统预留后剩余的一部分） */
export function computePromptBudget(window: ModelWindow, ratio = 0.6): number {
  const total = Math.max(0, window.context - window.reserveForOutput - window.reserveForSystem);
  return Math.max(512, Math.floor(total * ratio));
}
