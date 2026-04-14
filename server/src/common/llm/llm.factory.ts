import { LLMProvider } from './llm.interface';
import { OllamaProvider } from './ollama.provider';
import { OpenAICompatProvider } from './openai-compat.provider';
import {
  getDefaultOpenAICompatBaseUrl,
  getEnvBackedApiKey,
  getEnvBackedBaseUrl,
} from '../../modules/system/llm-provider-registry';
import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';

/**
 * 从 SQLite 读取配置（每次实时查询，不缓存）
 * 避免用户在 TUI 修改配置后需要重启服务的问题
 */
function getSqliteConfig(key: string): string | null {
  try {
    // 获取数据库路径
    let dbPath: string;
    const yamlPath = path.join(process.cwd(), 'data', 'config.yaml');
    if (fs.existsSync(yamlPath)) {
      const content = fs.readFileSync(yamlPath, 'utf-8');
      const match = content.match(/database:\s*\n\s*path:\s*["']?([^"'\n]+)["']?/);
      if (match) {
        const yamlDbPath = match[1].trim();
        dbPath = path.isAbsolute(yamlDbPath) ? yamlDbPath : path.join(process.cwd(), yamlDbPath);
      } else {
        dbPath = path.join(process.cwd(), process.env.DATABASE_PATH || 'data/secbot.db');
      }
    } else {
      const envDbPath = process.env.DATABASE_PATH || 'data/secbot.db';
      dbPath = path.isAbsolute(envDbPath) ? envDbPath : path.join(process.cwd(), envDbPath);
    }

    if (!fs.existsSync(dbPath)) return null;

    const db = new Database(dbPath, { readonly: true });
    const row = db.prepare('SELECT value FROM user_configs WHERE key = ?').get(key) as { value: string } | undefined;
    db.close();

    return row?.value ?? null;
  } catch {
    return null;
  }
}

/** 去掉用户误填的「Bearer 」前缀，避免 Authorization 变成 Bearer Bearer … */
function normalizeBearerApiKey(raw: string): string {
  const t = raw.trim();
  if (!t) return '';
  return t.replace(/^Bearer\s+/i, '').trim();
}

function resolveOpenAICompatApiKey(provider: string, explicit?: string): string {
  const sqliteKey = `${provider}_api_key`;
  const candidates = [
    normalizeBearerApiKey(explicit ?? ''),
    normalizeBearerApiKey(process.env.LLM_API_KEY ?? ''),
    normalizeBearerApiKey(getSqliteConfig(sqliteKey) ?? ''),  // SQLite 运行中配置
    normalizeBearerApiKey(getEnvBackedApiKey(provider)),
  ];
  return candidates.find((k) => k.length > 0) ?? '';
}

function resolveOpenAICompatBaseUrl(provider: string, explicit?: string): string | undefined {
  const sqliteKey = `${provider}_base_url`;
  const candidates = [
    (explicit ?? '').trim(),
    (process.env.LLM_BASE_URL ?? '').trim(),
    (getSqliteConfig(sqliteKey) ?? '').trim(),  // SQLite 运行中配置
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
