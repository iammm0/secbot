import { LLMProvider } from './llm.interface';
import { OllamaProvider } from './ollama.provider';
import { OpenAICompatProvider } from './openai-compat.provider';
import { getDefaultOpenAICompatBaseUrl } from '../../modules/system/llm-provider-registry';

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
    config.baseUrl ??
    getDefaultOpenAICompatBaseUrl(provider) ??
    (provider === 'deepseek' ? 'https://api.deepseek.com' : 'https://api.openai.com');
  const model = config.model ?? (provider === 'deepseek' ? 'deepseek-chat' : 'gpt-4o-mini');
  const apiKey = config.apiKey ?? '';

  return new OpenAICompatProvider(baseUrl, apiKey, model);
}
