import { LLMProvider } from './llm.interface';
import { OllamaProvider } from './ollama.provider';
import { OpenAICompatProvider } from './openai-compat.provider';
import {
  getDefaultOpenAICompatBaseUrl,
  getEnvBackedApiKey,
  getEnvBackedBaseUrl,
} from '../../modules/system/llm-provider-registry';

/** 去掉用户误填的「Bearer 」前缀，避免 Authorization 变成 Bearer Bearer … */
function normalizeBearerApiKey(raw: string): string {
  const t = raw.trim();
  if (!t) return '';
  return t.replace(/^Bearer\s+/i, '').trim();
}

function resolveOpenAICompatApiKey(provider: string, explicit?: string): string {
  const candidates = [
    normalizeBearerApiKey(explicit ?? ''),
    normalizeBearerApiKey(process.env.LLM_API_KEY ?? ''),
    normalizeBearerApiKey(getEnvBackedApiKey(provider)),
  ];
  return candidates.find((k) => k.length > 0) ?? '';
}

function resolveOpenAICompatBaseUrl(provider: string, explicit?: string): string | undefined {
  const candidates = [
    (explicit ?? '').trim(),
    (process.env.LLM_BASE_URL ?? '').trim(),
    getEnvBackedBaseUrl(provider),
  ];
  const first = candidates.find((u) => u.length > 0);
  return first;
}

export interface LLMConfig {
  provider: string;
  model?: string;
  baseUrl?: string;
  apiKey?: string;
}

export function createLLM(config: LLMConfig): LLMProvider {
  const provider = (config.provider ?? 'ollama').toLowerCase();

  if (provider === 'ollama') {
    return new OllamaProvider(
      config.baseUrl ?? 'http://localhost:11434',
      config.model ?? 'llama3.2',
    );
  }

  const baseUrl =
    resolveOpenAICompatBaseUrl(provider, config.baseUrl) ??
    getDefaultOpenAICompatBaseUrl(provider) ??
    (provider === 'deepseek' ? 'https://api.deepseek.com' : 'https://api.openai.com');
  const modelFromEnv =
    (process.env.LLM_MODEL ?? '').trim() ||
    (provider === 'deepseek' ? (process.env.DEEPSEEK_MODEL ?? '').trim() : '');
  const model =
    (config.model ?? '').trim() ||
    modelFromEnv ||
    (provider === 'deepseek' ? 'deepseek-chat' : 'gpt-4o-mini');
  const apiKey = resolveOpenAICompatApiKey(provider, config.apiKey);

  return new OpenAICompatProvider(baseUrl, apiKey, model);
}
