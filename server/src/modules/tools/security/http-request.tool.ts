import { BaseTool, ToolResult } from '../core/base-tool';

export class HttpRequestTool extends BaseTool {
  constructor() {
    super('http_request', 'HTTP请求 — 发送HTTP请求并返回响应');
  }

  async run(params: Record<string, unknown>): Promise<ToolResult> {
    const url = String(params.url ?? '').trim();
    if (!url) {
      return { success: false, result: null, error: '缺少必要参数: url' };
    }

    const method = ((params.method as string) || 'GET').toUpperCase();
    const headers: Record<string, string> = {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      ...(params.headers as Record<string, string> || {}),
    };
    const body = params.body as string | undefined;
    const timeoutMs = Math.min(Math.max(Number(params.timeout ?? 30) * 1000, 5000), 60000);
    const maxRetries = 2;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        const response = await fetch(url, {
          method,
          headers,
          body: method !== 'GET' && method !== 'HEAD' ? body : undefined,
          redirect: 'follow',
          signal: controller.signal,
        });
        clearTimeout(timer);

        if (attempt < maxRetries && (response.status === 429 || response.status >= 500)) {
          await this.sleep(1000 * (attempt + 1));
          continue;
        }

        const responseHeaders: Record<string, string> = {};
        response.headers.forEach((value, key) => { responseHeaders[key] = value; });

        const responseBody = await response.text();
        const maxLen = 8000;

        return {
          success: true,
          result: {
            status: response.status,
            statusText: response.statusText,
            headers: responseHeaders,
            body: responseBody.length > maxLen
              ? responseBody.slice(0, maxLen) + '...(truncated)'
              : responseBody,
          },
        };
      } catch (error) {
        if (attempt < maxRetries) {
          await this.sleep(1000 * (attempt + 1));
          continue;
        }
        const msg = (error as Error).message;
        return {
          success: false,
          result: null,
          error: msg.includes('abort') ? `HTTP请求超时 (${timeoutMs / 1000}s)` : `HTTP请求失败: ${msg}`,
        };
      }
    }
    return { success: false, result: null, error: 'HTTP请求失败: 重试耗尽' };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }
}
