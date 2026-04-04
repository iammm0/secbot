/**
 * REST API 客户端 — 供斜杠命令调用 /api/agents、/api/system 等
 */
import { getBaseUrl } from './config.js';

/** 后端全局 TransformInterceptor 将控制器返回值包在 { success, data } 中，此处解包为业务 JSON */
function unwrapNestEnvelope<T>(json: unknown): T {
  if (
    json !== null &&
    typeof json === 'object' &&
    (json as { success?: unknown }).success === true &&
    'data' in (json as object)
  ) {
    return (json as { data: T }).data;
  }
  return json as T;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const url = `${getBaseUrl()}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers as Record<string, string>) },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  const json: unknown = await res.json();
  return unwrapNestEnvelope<T>(json);
}

export const api = {
  get: <T>(path: string) => request<T>(path, { method: 'GET' }),
  post: <T>(path: string, body?: unknown) =>
    request<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
};
