import { LLMProvider } from './llm.interface';
import { OllamaProvider } from './ollama.provider';
import { OpenAICompatProvider } from './openai-compat.provider';
import {
  getDefaultOpenAICompatBaseUrl,
  getEnvBackedApiKey,
  getEnvBackedBaseUrl,
} from '../../modules/system/llm-provider-registry';
import { deletePersistedConfig, getPersistedConfig } from '../config/persisted-config';

type ConfigSource = 'sqlite' | 'explicit' | 'generic_env' | 'provider_env' | 'default' | 'none';

interface ResolvedConfigValue {
  value: string;
  source: ConfigSource;
  sqliteKey?: string;
}

interface CandidateConfigValue {
  value?: string | null;
  source: ConfigSource;
  sqliteKey?: string;
}

/** 去掉用户误填的「Bearer 」前缀，避免 Authorization 变成 Bearer Bearer … */
function normalizeBearerApiKey(raw: string): string {
  const t = raw.trim();
  if (!t) return '';
  return t.replace(/^Bearer\s+/i, '').trim();
}

function resolveFirstConfigValue(candidates: CandidateConfigValue[]): ResolvedConfigValue {
  for (const candidate of candidates) {
    const value = (candidate.value ?? '').trim();
    if (value.length > 0) {
      return {
        value,
        source: candidate.source,
        sqliteKey: candidate.sqliteKey,
      };
    }
  }
  return { value: '', source: 'none' };
}

function providerModelEnvKey(provider: string): string {
  return `${provider.toUpperCase().replace(/-/g, '_')}_MODEL`;
}

function resolveProvider(explicit?: string): string {
  return resolveFirstConfigValue([
    { value: getPersistedConfig('llm_provider'), source: 'sqlite', sqliteKey: 'llm_provider' },
    { value: explicit, source: 'explicit' },
    { value: process.env.LLM_PROVIDER, source: 'generic_env' },
    { value: 'ollama', source: 'default' },
  ]).value.toLowerCase();
}

function resolveModel(provider: string, explicit?: string): string {
  const sqliteKey = `${provider}_model`;
  const defaultModel =
    provider === 'ollama' ? 'llama3.2' : provider === 'deepseek' ? 'deepseek-chat' : 'gpt-4o-mini';
  return resolveFirstConfigValue([
    { value: getPersistedConfig(sqliteKey), source: 'sqlite', sqliteKey },
    { value: explicit, source: 'explicit' },
    { value: process.env.LLM_MODEL, source: 'generic_env' },
    { value: process.env[providerModelEnvKey(provider)], source: 'provider_env' },
    { value: defaultModel, source: 'default' },
  ]).value;
}

function resolveOllamaBaseUrl(explicit?: string): string {
  return resolveFirstConfigValue([
    {
      value: getPersistedConfig('ollama_base_url'),
      source: 'sqlite',
      sqliteKey: 'ollama_base_url',
    },
    { value: explicit, source: 'explicit' },
    { value: process.env.LLM_BASE_URL, source: 'generic_env' },
    { value: process.env.OLLAMA_BASE_URL, source: 'provider_env' },
    { value: 'http://localhost:11434', source: 'default' },
  ]).value;
}

function resolveOpenAICompatApiKey(provider: string, explicit?: string): ResolvedConfigValue {
  const sqliteKey = `${provider}_api_key`;
  return resolveFirstConfigValue([
    {
      value: normalizeBearerApiKey(getPersistedConfig(sqliteKey) ?? ''),
      source: 'sqlite',
      sqliteKey,
    },
    { value: normalizeBearerApiKey(explicit ?? ''), source: 'explicit' },
    { value: normalizeBearerApiKey(process.env.LLM_API_KEY ?? ''), source: 'generic_env' },
    { value: normalizeBearerApiKey(getEnvBackedApiKey(provider)), source: 'provider_env' },
  ]);
}

function resolveOpenAICompatBaseUrl(provider: string, explicit?: string): string | undefined {
  const sqliteKey = `${provider}_base_url`;
  const resolved = resolveFirstConfigValue([
    { value: getPersistedConfig(sqliteKey), source: 'sqlite', sqliteKey },
    { value: explicit, source: 'explicit' },
    { value: process.env.LLM_BASE_URL, source: 'generic_env' },
    { value: getEnvBackedBaseUrl(provider), source: 'provider_env' },
  ]);
  return resolved.value || undefined;
}

export interface LLMConfig {
  provider?: string;
  model?: string;
  baseUrl?: string;
  apiKey?: string;
}

export function createLLM(config: LLMConfig = {}): LLMProvider {
  const provider = resolveProvider(config.provider);

  if (provider === 'ollama') {
    return new OllamaProvider(
      resolveOllamaBaseUrl(config.baseUrl),
      resolveModel(provider, config.model),
    );
  }

  const baseUrl =
    resolveOpenAICompatBaseUrl(provider, config.baseUrl) ??
    getDefaultOpenAICompatBaseUrl(provider) ??
    (provider === 'deepseek' ? 'https://api.deepseek.com' : 'https://api.openai.com');
  const model = resolveModel(provider, config.model);
  const apiKey = resolveOpenAICompatApiKey(provider, config.apiKey);

  return new OpenAICompatProvider(baseUrl, apiKey.value, model, {
    onInvalidPersistedApiKey:
      apiKey.source === 'sqlite' && apiKey.sqliteKey
        ? () => {
            deletePersistedConfig(apiKey.sqliteKey!);
          }
        : undefined,
  });
}
