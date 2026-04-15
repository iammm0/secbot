import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { getPersistedConfig } from '../config/persisted-config';
import { createLLM } from './llm.factory';

const ENV_KEYS = [
  'DATABASE_PATH',
  'LLM_PROVIDER',
  'LLM_API_KEY',
  'LLM_BASE_URL',
  'LLM_MODEL',
  'DEEPSEEK_API_KEY',
  'DEEPSEEK_BASE_URL',
  'DEEPSEEK_MODEL',
];

let originalFetch: typeof fetch;
let tempDir: string | null = null;
const originalEnv = new Map<string, string | undefined>();

function restoreEnv(): void {
  for (const key of ENV_KEYS) {
    const value = originalEnv.get(key);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
}

function setupDb(rows: Record<string, string>): string {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'secbot-llm-'));
  const dbPath = path.join(tempDir, 'secbot.db');
  process.env.DATABASE_PATH = dbPath;

  const db = new Database(dbPath);
  db.exec(`
    CREATE TABLE user_configs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key TEXT NOT NULL UNIQUE,
      value TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT 'general',
      description TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);
  const insert = db.prepare(`
    INSERT INTO user_configs (key, value, category, description)
    VALUES (?, ?, 'test', 'test config')
  `);
  for (const [key, value] of Object.entries(rows)) {
    insert.run(key, value);
  }
  db.close();

  return dbPath;
}

describe('createLLM persisted config resolution', () => {
  beforeAll(() => {
    originalFetch = globalThis.fetch;
    for (const key of ENV_KEYS) {
      originalEnv.set(key, process.env[key]);
    }
  });

  afterEach(() => {
    restoreEnv();
    globalThis.fetch = originalFetch;
    if (tempDir) {
      fs.rmSync(tempDir, { recursive: true, force: true });
      tempDir = null;
    }
    vi.restoreAllMocks();
  });

  afterAll(() => {
    restoreEnv();
    globalThis.fetch = originalFetch;
  });

  it('prefers sqlite API key, model, and base URL over environment variables', () => {
    setupDb({
      llm_provider: 'deepseek',
      deepseek_api_key: 'sqlite-key',
      deepseek_model: 'sqlite-model',
      deepseek_base_url: 'https://sqlite.example',
    });
    process.env.LLM_PROVIDER = 'openai';
    process.env.LLM_API_KEY = 'env-key';
    process.env.LLM_MODEL = 'env-model';
    process.env.LLM_BASE_URL = 'https://env.example';
    process.env.DEEPSEEK_API_KEY = 'provider-env-key';

    const llm = createLLM() as unknown as {
      apiKey: string;
      baseUrl: string;
      model: string;
    };

    expect(llm.apiKey).toBe('sqlite-key');
    expect(llm.baseUrl).toBe('https://sqlite.example');
    expect(llm.model).toBe('sqlite-model');
  });

  it('deletes the persisted API key immediately after an invalid-key response', async () => {
    setupDb({
      llm_provider: 'openai',
      openai_api_key: 'sqlite-invalid-key',
    });
    process.env.LLM_API_KEY = 'env-key';
    globalThis.fetch = vi.fn(async () => ({
      ok: false,
      status: 401,
      text: async () => 'invalid api key',
    })) as unknown as typeof fetch;

    await expect(createLLM().chat([{ role: 'user', content: 'hello' }])).rejects.toThrow(
      /HTTP 401/,
    );

    expect(getPersistedConfig('openai_api_key')).toBeNull();
    expect(process.env.LLM_API_KEY).toBe('env-key');
  });
});
