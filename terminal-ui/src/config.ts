/**
 * API 配置 — 通过环境变量或默认值指定后端地址
 */
const DEFAULT_BASE_URL = 'http://localhost:8000';

export function getBaseUrl(): string {
  return (
    process.env.SECBOT_API_URL ??
    process.env.OPENCOMSAGENT_API_URL ??
    process.env.BASE_URL ??
    DEFAULT_BASE_URL
  );
}

export const CONNECTION_TIMEOUT_MS = 15000;

/** 启动前检查后端是否可达（GET /api/system/info），超时 3 秒 */
export async function checkBackend(): Promise<{ ok: boolean; error?: string }> {
  const base = getBaseUrl();
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 3000);
  try {
    const res = await fetch(`${base}/api/system/info`, { signal: controller.signal });
    clearTimeout(t);
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    return { ok: true };
  } catch (e) {
    clearTimeout(t);
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: msg };
  }
}
