/**
 * 本机已配置的模型代理探测：cc-switch / Claude Code / Codex。
 *
 * 只读本机配置文件，不写入任何东西。导出纯函数便于单测；API Key 一律脱敏，
 * 导入时由调用方（SystemService.importLocalProvider）写回 secbot 自身的 SQLite 配置。
 */
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import Database from 'better-sqlite3';

export type LocalProviderSource = 'cc-switch' | 'claude-code' | 'codex';
export type LocalProviderTarget = 'custom' | 'codex' | 'anthropic';
export type LocalWireApi = 'responses' | 'openai-compat' | null;

export interface LocalProviderCandidate {
  /** 候选 ID（同源内唯一，用于前端 key 与导入） */
  id: string;
  source: LocalProviderSource;
  /** 界面展示的源名称，如 "cc-switch · My Claude" */
  sourceLabel: string;
  /** 原配置所属应用：claude / claude-desktop / codex */
  app: string;
  /** 导入到 secbot 的目标 provider id */
  targetProvider: LocalProviderTarget;
  baseUrl: string;
  model: string | null;
  /** 完整 API Key：仅在服务端内部使用，列表接口必须脱敏后再返回 */
  apiKey: string;
  maskedApiKey: string;
  hasApiKey: boolean;
  wireApi: LocalWireApi;
  /** cc-switch 中是否为当前启用配置，或是否为正在生效的 claude/codex 配置 */
  isCurrent: boolean;
  /** 与 secbot 当前已保存的同一 provider 配置比对结果 */
  alreadyImported: boolean;
}

/** 供调用方注入「该 baseUrl 是否已导入」的判断（SystemService 依据 SQLite 配置） */
export type ImportedProbe = (targetProvider: LocalProviderTarget, baseUrl: string) => boolean;

export interface LocalDetectOptions {
  /** 探测目录，默认 os.homedir()；单测注入临时目录 */
  home?: string;
}

const RESPONSES_VERSION_SEGMENTS = ['/v1', '/v2', '/v3'];

/**
 * 校验 codex（Responses 中转）的 Base URL：依次尝试 {base}/responses 与常见
 * 版本前缀变体（/v1 /v2 /v3），返回第一个响应非 404 的地址。
 * 一些中转（如火山方舟）实际端点在 /api/v3/responses，而 cc-switch 存的 base 是
 * /api —— 直接拼 /responses 会 404。全部尝试失败则原样返回。
 */
export async function resolveResponsesBase(baseUrl: string, apiKey: string): Promise<string> {
  const normalized = baseUrl.replace(/\/+$/, '');
  const candidates = [
    normalized,
    ...RESPONSES_VERSION_SEGMENTS.map((seg) => `${normalized}${seg}`),
  ];
  for (const root of candidates) {
    try {
      const res = await fetch(`${root}/responses`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({ model: '', input: [], stream: false }),
        signal: AbortSignal.timeout(4000),
      });
      if (res.status !== 404) return root;
    } catch {
      /* 该变体不可达，尝试下一个 */
    }
  }
  return baseUrl;
}

function homeDir(options?: LocalDetectOptions): string {
  return options?.home ?? os.homedir();
}

function maskKey(key: string): string {
  const trimmed = (key ?? '').trim();
  if (!trimmed) return '';
  if (trimmed.length <= 8) return '••••';
  return `${trimmed.slice(0, 4)}•••${trimmed.slice(-4)}`;
}

function readJsonFile(file: string): unknown | null {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

/** 解析 cc-switch providers 的 settings_config（JSON） */
interface CcSwitchSettings {
  env?: Record<string, string>;
  auth?: Record<string, string>;
  config?: string;
  modelCatalog?: { models?: Array<{ model?: string; displayName?: string }> };
}

interface CcSwitchProviderRow {
  id: string;
  app_type: string;
  name: string;
  settings_config: string;
  is_current: number;
}

async function parseToml(text: string): Promise<Record<string, unknown>> {
  const { parse } = await import('smol-toml');
  return parse(text) as Record<string, unknown>;
}

function pickAuthKey(auth: Record<string, string> | undefined): string {
  if (!auth) return '';
  const candidates = [
    'OPENAI_API_KEY',
    'CODEX_API_KEY',
    'experimental_bearer_token',
    'api_key',
    'ANTHROPIC_AUTH_TOKEN',
  ];
  for (const key of candidates) {
    const value = (auth[key] ?? '').trim();
    if (value) return value;
  }
  return '';
}

/** 从 cc-switch 的 codex 配置字符串里取 base_url 与 model（active provider 段） */
async function codexConfigToml(configText: string): Promise<{ baseUrl: string; model: string }> {
  if (!configText.trim()) return { baseUrl: '', model: '' };
  try {
    const parsed = await parseToml(configText);
    const providerName = String(parsed.model_provider ?? 'custom');
    const providers = (parsed.model_providers as Record<string, unknown> | undefined) ?? {};
    const section = (providers[providerName] as Record<string, unknown> | undefined) ?? {};
    return {
      baseUrl: String(section.base_url ?? '').trim(),
      model: String(parsed.model ?? section.model ?? '').trim(),
    };
  } catch {
    return { baseUrl: '', model: '' };
  }
}

async function detectCcSwitch(
  isImported: ImportedProbe,
  options?: LocalDetectOptions,
): Promise<LocalProviderCandidate[]> {
  const dbPath = path.join(homeDir(options), '.cc-switch', 'cc-switch.db');
  if (!fs.existsSync(dbPath)) return [];
  let db: Database.Database | null = null;
  try {
    db = new Database(dbPath, { readonly: true, fileMustExist: true });
    const rows = db
      .prepare(
        `SELECT id, app_type, name, settings_config, is_current
         FROM providers WHERE app_type IN ('claude','claude-desktop','codex')`,
      )
      .all() as CcSwitchProviderRow[];
    const out: LocalProviderCandidate[] = [];
    for (const row of rows) {
      if (row.id.endsWith('-official')) continue; // 官方空配置，无代理可用
      const parsed = readJsonFileValue(row.settings_config) as CcSwitchSettings | null;
      if (!parsed) continue;

      if (row.app_type === 'claude' || row.app_type === 'claude-desktop') {
        const env = parsed.env ?? {};
        const token =
          (env.ANTHROPIC_AUTH_TOKEN ?? '').trim() || (env.ANTHROPIC_API_KEY ?? '').trim();
        const baseUrl = (env.ANTHROPIC_BASE_URL ?? '').trim();
        const model = (env.ANTHROPIC_MODEL ?? '').trim() || null;
        if (!token || !baseUrl) continue;
        out.push({
          id: `cc-switch:${row.id}`,
          source: 'cc-switch',
          sourceLabel: `cc-switch · ${row.name || row.id}`,
          app: row.app_type,
          targetProvider: 'custom',
          baseUrl,
          model,
          apiKey: token,
          maskedApiKey: maskKey(token),
          hasApiKey: true,
          wireApi: 'openai-compat',
          isCurrent: Boolean(row.is_current),
          alreadyImported: isImported('custom', baseUrl),
        });
      } else if (row.app_type === 'codex') {
        const auth = parsed.auth ?? {};
        const key = pickAuthKey(auth);
        const { baseUrl, model } = await codexConfigToml(parsed.config ?? '');
        if (!key || !baseUrl) continue;
        const catalogModel =
          parsed.modelCatalog?.models?.find((item) => item?.model)?.model ?? null;
        out.push({
          id: `cc-switch:${row.id}`,
          source: 'cc-switch',
          sourceLabel: `cc-switch · ${row.name || row.id}`,
          app: row.app_type,
          targetProvider: 'codex',
          baseUrl,
          model: model || catalogModel,
          apiKey: key,
          maskedApiKey: maskKey(key),
          hasApiKey: true,
          wireApi: 'responses',
          isCurrent: Boolean(row.is_current),
          alreadyImported: isImported('codex', baseUrl),
        });
      }
    }
    return out;
  } catch {
    return [];
  } finally {
    try {
      db?.close();
    } catch {
      /* ignore */
    }
  }
}

function readJsonFileValue(raw: string): unknown {
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

/** Claude Code 的全局 settings.json 里的 env 代理（ANTHROPIC_AUTH_TOKEN / BASE_URL / MODEL） */
async function detectClaudeCode(
  isImported: ImportedProbe,
  options?: LocalDetectOptions,
): Promise<LocalProviderCandidate[]> {
  const settingsPath = path.join(homeDir(options), '.claude', 'settings.json');
  const raw = readJsonFile(settingsPath) as { env?: Record<string, string> } | null;
  if (!raw?.env) return [];
  const env = raw.env;
  const token = (env.ANTHROPIC_AUTH_TOKEN ?? '').trim() || (env.ANTHROPIC_API_KEY ?? '').trim();
  const baseUrl = (env.ANTHROPIC_BASE_URL ?? '').trim();
  const model = (env.ANTHROPIC_MODEL ?? '').trim() || null;
  if (!token || !baseUrl) return [];
  return [
    {
      id: 'claude-code:settings',
      source: 'claude-code',
      sourceLabel: 'Claude Code · 全局 settings',
      app: 'claude',
      targetProvider: 'custom',
      baseUrl,
      model,
      apiKey: token,
      maskedApiKey: maskKey(token),
      hasApiKey: true,
      wireApi: 'openai-compat',
      isCurrent: true,
      alreadyImported: isImported('custom', baseUrl),
    },
  ];
}

/** Codex 的 config.toml（当前生效的 model_provider 段） */
async function detectCodex(
  isImported: ImportedProbe,
  options?: LocalDetectOptions,
): Promise<LocalProviderCandidate[]> {
  const configPath = path.join(homeDir(options), '.codex', 'config.toml');
  if (!fs.existsSync(configPath)) return [];
  try {
    const text = fs.readFileSync(configPath, 'utf8');
    const parsed = await parseToml(text);
    const providerName = String(parsed.model_provider ?? 'custom');
    const providers = (parsed.model_providers as Record<string, unknown> | undefined) ?? {};
    const section = (providers[providerName] as Record<string, unknown> | undefined) ?? {};
    const baseUrl = String(section.base_url ?? '').trim();
    const key = String(section.experimental_bearer_token ?? '').trim();
    const model = String(parsed.model ?? section.model ?? '').trim() || null;
    if (!key || !baseUrl) return [];
    return [
      {
        id: 'codex:config',
        source: 'codex',
        sourceLabel: 'Codex · config.toml',
        app: 'codex',
        targetProvider: 'codex',
        baseUrl,
        model,
        apiKey: key,
        maskedApiKey: maskKey(key),
        hasApiKey: true,
        wireApi: 'responses',
        isCurrent: true,
        alreadyImported: isImported('codex', baseUrl),
      },
    ];
  } catch {
    return [];
  }
}

export async function detectLocalProviders(
  isImported: ImportedProbe,
  options?: LocalDetectOptions,
): Promise<LocalProviderCandidate[]> {
  const [cc, claude, codex] = await Promise.all([
    detectCcSwitch(isImported, options),
    detectClaudeCode(isImported, options),
    detectCodex(isImported, options),
  ]);
  // 去重：同一 baseUrl + target 只保留一条（cc-switch 优先、其次 claude/codex）
  const seen = new Set<string>();
  return [...cc, ...claude, ...codex].filter((candidate) => {
    const key = `${candidate.targetProvider}|${candidate.baseUrl}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
