import { BaseTool, ToolResult } from '../core/base-tool';

export class HttpRequestTool extends BaseTool {
  constructor() {
    super('http_request', 'HTTP请求 — 发送HTTP请求并返回响应');
  }

  async run(params: Record<string, unknown>): Promise<ToolResult> {
    try {
      const url = params.url as string;
      if (!url) {
        return { success: false, result: null, error: '缺少必要参数: url' };
      }

      const method = ((params.method as string) || 'GET').toUpperCase();
      const headers = (params.headers as Record<string, string>) || {};
      const body = params.body as string | undefined;

      const response = await fetch(url, {
        method,
        headers,
        body: method !== 'GET' && method !== 'HEAD' ? body : undefined,
      });

      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });

      const responseBody = await response.text();
      const maxLen = 5000;

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
      return {
        success: false,
        result: null,
        error: `HTTP请求失败: ${(error as Error).message}`,
      };
    }
  }
}
