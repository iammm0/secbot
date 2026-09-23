export type JevStage = 'intent' | 'qaLive' | 'adaptive' | 'reactStop' | 'context';

export interface JevRuntimeConfig {
  enabled: boolean;
  intent: boolean;
  qaLive: boolean;
  adaptive: boolean;
  reactStop: boolean;
  context: boolean;
  apiKey: string;
  baseUrl: string;
  model: string;
  confidenceMin: number;
  reactStopMin: number;
}

export interface JevPublicConfig {
  enabled: boolean;
  intent: boolean;
  qaLive: boolean;
  adaptive: boolean;
  reactStop: boolean;
  context: boolean;
  baseUrl: string;
  model: string;
  confidenceMin: number;
  reactStopMin: number;
  hasApiKey: boolean;
}

const DEFAULT_BASE_URL = 'https://api.typesafe.ai';
const DEFAULT_MODEL = 'jev-latest';
const DEFAULT_CONFIDENCE_MIN = 0.85;
const DEFAULT_REACT_STOP_MIN = 0.92;

let cached: JevRuntimeConfig | null = null;

export function envTruthy(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return false;
  return ['1', 'true', 'yes', 'on', 'enabled'].includes(value.trim().toLowerCase());
}

function clampUnit(value: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(1, Math.max(0, value));
}

function parseUnit(raw: string | undefined, fallback: number): number {
  const n = Number((raw ?? '').trim());
  return clampUnit(n, fallback);
}

export function defaultJevRuntimeConfig(): JevRuntimeConfig {
  return {
    enabled: envTruthy(process.env.SECBOT_JEV_ENABLED),
    intent: envTruthy(process.env.SECBOT_JEV_INTENT),
    qaLive: envTruthy(process.env.SECBOT_JEV_QA_LIVE),
    adaptive: envTruthy(process.env.SECBOT_JEV_ADAPTIVE),
    reactStop: envTruthy(process.env.SECBOT_JEV_REACT_STOP),
    context: envTruthy(process.env.SECBOT_JEV_CONTEXT),
    apiKey: (process.env.TYPESAFE_API_KEY ?? process.env.JEV_API_KEY ?? '').trim(),
    baseUrl: (process.env.TYPESAFE_BASE_URL ?? process.env.JEV_BASE_URL ?? DEFAULT_BASE_URL).trim() ||
      DEFAULT_BASE_URL,
    model: (process.env.SECBOT_JEV_MODEL ?? process.env.TYPESAFE_DEFAULT_MODEL ?? DEFAULT_MODEL).trim() ||
      DEFAULT_MODEL,
    confidenceMin: parseUnit(process.env.SECBOT_JEV_CONFIDENCE_MIN, DEFAULT_CONFIDENCE_MIN),
    reactStopMin: parseUnit(process.env.SECBOT_JEV_REACT_STOP_MIN, DEFAULT_REACT_STOP_MIN),
  };
}

export function getJevRuntimeConfig(): JevRuntimeConfig {
  return cached ? { ...cached } : defaultJevRuntimeConfig();
}

export function setJevRuntimeConfig(partial: Partial<JevRuntimeConfig>): JevRuntimeConfig {
  const current = getJevRuntimeConfig();
  const next: JevRuntimeConfig = {
    ...current,
    ...partial,
  };
  next.apiKey = (next.apiKey ?? '').trim();
  next.baseUrl = next.baseUrl.trim() || DEFAULT_BASE_URL;
  next.model = next.model.trim() || DEFAULT_MODEL;
  next.confidenceMin = clampUnit(next.confidenceMin, DEFAULT_CONFIDENCE_MIN);
  next.reactStopMin = clampUnit(next.reactStopMin, DEFAULT_REACT_STOP_MIN);
  cached = next;
  applyJevEnv(next);
  return { ...next };
}

export function applyJevEnv(config: JevRuntimeConfig): void {
  process.env.SECBOT_JEV_ENABLED = config.enabled ? '1' : '0';
  process.env.SECBOT_JEV_INTENT = config.intent ? '1' : '0';
  process.env.SECBOT_JEV_QA_LIVE = config.qaLive ? '1' : '0';
  process.env.SECBOT_JEV_ADAPTIVE = config.adaptive ? '1' : '0';
  process.env.SECBOT_JEV_REACT_STOP = config.reactStop ? '1' : '0';
  process.env.SECBOT_JEV_CONTEXT = config.context ? '1' : '0';
  process.env.TYPESAFE_BASE_URL = config.baseUrl;
  process.env.SECBOT_JEV_MODEL = config.model;
  process.env.SECBOT_JEV_CONFIDENCE_MIN = String(config.confidenceMin);
  process.env.SECBOT_JEV_REACT_STOP_MIN = String(config.reactStopMin);
  if (config.apiKey) {
    process.env.TYPESAFE_API_KEY = config.apiKey;
  }
}

export function resetJevRuntimeConfig(): void {
  cached = null;
}

/** Test helper: drop cached config and the env keys this module writes. */
export function clearJevEnv(): void {
  cached = null;
  const keys = [
    'SECBOT_JEV_ENABLED',
    'SECBOT_JEV_INTENT',
    'SECBOT_JEV_QA_LIVE',
    'SECBOT_JEV_ADAPTIVE',
    'SECBOT_JEV_REACT_STOP',
    'SECBOT_JEV_CONTEXT',
    'TYPESAFE_API_KEY',
    'JEV_API_KEY',
    'TYPESAFE_BASE_URL',
    'JEV_BASE_URL',
    'SECBOT_JEV_MODEL',
    'TYPESAFE_DEFAULT_MODEL',
    'SECBOT_JEV_CONFIDENCE_MIN',
    'SECBOT_JEV_REACT_STOP_MIN',
  ];
  for (const key of keys) delete process.env[key];
}

export function toPublicJevConfig(config: JevRuntimeConfig = getJevRuntimeConfig()): JevPublicConfig {
  return {
    enabled: config.enabled,
    intent: config.intent,
    qaLive: config.qaLive,
    adaptive: config.adaptive,
    reactStop: config.reactStop,
    context: config.context,
    baseUrl: config.baseUrl,
    model: config.model,
    confidenceMin: config.confidenceMin,
    reactStopMin: config.reactStopMin,
    hasApiKey: config.apiKey.length > 0,
  };
}

export function isJevStageEnabled(
  stage: JevStage,
  config: JevRuntimeConfig = getJevRuntimeConfig(),
): boolean {
  if (!config.enabled || !config.apiKey) return false;
  return Boolean(config[stage]);
}
