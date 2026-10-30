import { describe, expect, it, afterEach } from 'vitest';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import Database from 'better-sqlite3';
import {
  detectLocalProviders,
  resolveResponsesBase,
  type ImportedProbe,
  type LocalProviderCandidate,
} from './local-provider-detector';

const tmpDirs: string[] = [];

function makeHome(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'secbot-lpd-'));
  tmpDirs.push(dir);
  return dir;
}

afterEach(() => {
  for (const dir of tmpDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

function writeFile(file: string, content: string): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

function seedCcSwitch(home: string): void {
  const dbPath = path.join(home, '.cc-switch', 'cc-switch.db');
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new Database(dbPath);
  db.exec(`
    CREATE TABLE providers (
      id TEXT NOT NULL,
      app_type TEXT NOT NULL,
      name TEXT NOT NULL,
      settings_config TEXT NOT NULL,
      is_current BOOLEAN NOT NULL DEFAULT 0,
      PRIMARY KEY (id, app_type)
    );
  `);
  const insert = db.prepare(
    'INSERT INTO providers (id, app_type, name, settings_config, is_current) VALUES (?, ?, ?, ?, ?)',
  );
  insert.run(
    'myclaude-1',
    'claude',
    'My Relay',
    JSON.stringify({
      env: {
        ANTHROPIC_AUTH_TOKEN: 'sk-test123456',
        ANTHROPIC_BASE_URL: 'https://relay.example.com',
        ANTHROPIC_MODEL: 'claude-sonnet-4-5',
      },
    }),
    1,
  );
  insert.run(
    'mycodex-1',
    'codex',
    'Volcano',
    JSON.stringify({
      auth: { OPENAI_API_KEY: 'ark-test789' },
      config:
        'model = "deepseek-v4-flash"\n[model_providers.custom]\nname = "ark"\nbase_url = "https://ark.example.com/api"\nwire_api = "responses"\nrequires_openai_auth = false\n',
    }),
    1,
  );
  insert.run('claude-official', 'claude', 'Claude Official', JSON.stringify({ env: {} }), 0);
  db.close();
}

const neverImported: ImportedProbe = () => false;

function find(candidates: LocalProviderCandidate[], id: string): LocalProviderCandidate {
  const hit = candidates.find((candidate) => candidate.id === id);
  expect(hit).toBeDefined();
  return hit!;
}

describe('detectLocalProviders', () => {
  it('reads cc-switch claude and codex providers, masks keys, skips official', async () => {
    const home = makeHome();
    seedCcSwitch(home);

    const candidates = await detectLocalProviders(neverImported, { home });

    expect(candidates).toHaveLength(2);
    const claude = find(candidates, 'cc-switch:myclaude-1');
    expect(claude.targetProvider).toBe('custom');
    expect(claude.baseUrl).toBe('https://relay.example.com');
    expect(claude.model).toBe('claude-sonnet-4-5');
    expect(claude.maskedApiKey).toContain('•••');
    expect(claude.maskedApiKey).not.toContain('sk-test123456');
    expect(claude.hasApiKey).toBe(true);
    expect(claude.isCurrent).toBe(true);

    const codex = find(candidates, 'cc-switch:mycodex-1');
    expect(codex.targetProvider).toBe('codex');
    expect(codex.baseUrl).toBe('https://ark.example.com/api');
    expect(codex.model).toBe('deepseek-v4-flash');
    expect(codex.wireApi).toBe('responses');
  });

  it('reads Claude Code settings.json env proxy', async () => {
    const home = makeHome();
    writeFile(
      path.join(home, '.claude', 'settings.json'),
      JSON.stringify({
        env: {
          ANTHROPIC_AUTH_TOKEN: 'sk-cc-token',
          ANTHROPIC_BASE_URL: 'https://claude-relay.example.com',
          ANTHROPIC_MODEL: 'gpt-6-sol',
        },
      }),
    );

    const candidates = await detectLocalProviders(neverImported, { home });
    expect(candidates).toHaveLength(1);
    expect(candidates[0].source).toBe('claude-code');
    expect(candidates[0].baseUrl).toBe('https://claude-relay.example.com');
    expect(candidates[0].targetProvider).toBe('custom');
  });

  it('reads Codex config.toml active provider', async () => {
    const home = makeHome();
    writeFile(
      path.join(home, '.codex', 'config.toml'),
      `model = "deepseek-v4-pro"
model_provider = "custom"
disable_response_storage = true

[model_providers.custom]
name = "ark"
base_url = "https://ark.example.com/api"
wire_api = "responses"
experimental_bearer_token = "ark-toml-token"
`,
    );

    const candidates = await detectLocalProviders(neverImported, { home });
    expect(candidates).toHaveLength(1);
    expect(candidates[0].source).toBe('codex');
    expect(candidates[0].targetProvider).toBe('codex');
    expect(candidates[0].baseUrl).toBe('https://ark.example.com/api');
    expect(candidates[0].model).toBe('deepseek-v4-pro');
    expect(candidates[0].wireApi).toBe('responses');
  });

  it('dedupes same baseUrl across sources and honors alreadyImported probe', async () => {
    const home = makeHome();
    // cc-switch claude 与 Claude Code settings 指向同一 baseUrl → 只保留一条
    seedCcSwitch(home);
    writeFile(
      path.join(home, '.claude', 'settings.json'),
      JSON.stringify({
        env: {
          ANTHROPIC_AUTH_TOKEN: 'sk-dup',
          ANTHROPIC_BASE_URL: 'https://relay.example.com',
        },
      }),
    );

    const candidates = await detectLocalProviders(neverImported, { home });
    const claude = candidates.filter(
      (candidate) => candidate.baseUrl === 'https://relay.example.com',
    );
    expect(claude).toHaveLength(1);
    expect(claude[0].source).toBe('cc-switch');

    // alreadyImported：baseUrl 已在 secbot 配置中
    const probe: ImportedProbe = (target, baseUrl) =>
      target === 'custom' && baseUrl === 'https://relay.example.com';
    const imported = await detectLocalProviders(probe, { home });
    expect(find(imported, 'cc-switch:myclaude-1').alreadyImported).toBe(true);
    expect(find(imported, 'cc-switch:mycodex-1').alreadyImported).toBe(false);
  });

  it('returns empty when no config files exist', async () => {
    const home = makeHome();
    const candidates = await detectLocalProviders(neverImported, { home });
    expect(candidates).toEqual([]);
  });
});

describe('resolveResponsesBase', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('picks the first non-404 variant (ark-style /api → /api/v3)', async () => {
    const calls: string[] = [];
    globalThis.fetch = (async (url: string | URL) => {
      calls.push(String(url));
      const href = String(url);
      const status = href.includes('/api/v3/') ? 200 : 404;
      return new Response('{}', { status });
    }) as typeof fetch;

    const resolved = await resolveResponsesBase('https://ark.example.com/api', 'ark-key');
    expect(resolved).toBe('https://ark.example.com/api/v3');
    expect(calls.some((call) => call.includes('/api/responses'))).toBe(true);
    expect(calls.some((call) => call.includes('/api/v3/responses'))).toBe(true);
  });

  it('keeps the original base when every variant 404s', async () => {
    globalThis.fetch = (async () => new Response('{}', { status: 404 })) as typeof fetch;
    const resolved = await resolveResponsesBase('https://relay.example.com/api', 'key');
    expect(resolved).toBe('https://relay.example.com/api');
  });

  it('returns the exact base when it already responds', async () => {
    globalThis.fetch = (async (url: string | URL) => {
      const href = String(url);
      return new Response('{}', { status: href.includes('/api/v3/') ? 200 : 400 });
    }) as typeof fetch;
    const resolved = await resolveResponsesBase('https://relay.example.com/api/v3', 'key');
    expect(resolved).toBe('https://relay.example.com/api/v3');
  });
});
