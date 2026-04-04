import { BaseTool, ToolResult } from '../core/base-tool';

export class CorsCheckerTool extends BaseTool {
  constructor() {
    super('cors_check', 'CORS检查 — 检测目标网站的跨域资源共享配置');
  }

  async run(params: Record<string, unknown>): Promise<ToolResult> {
    try {
      const url = params.url as string;
      if (!url) {
        return { success: false, result: null, error: '缺少必要参数: url' };
      }

      const response = await fetch(url, {
        method: 'OPTIONS',
        headers: {
          Origin: 'https://evil.example.com',
          'Access-Control-Request-Method': 'GET',
        },
      });

      const allowOrigin = response.headers.get('Access-Control-Allow-Origin') || '';
      const allowMethods = response.headers.get('Access-Control-Allow-Methods') || '';
      const allowHeaders = response.headers.get('Access-Control-Allow-Headers') || '';
      const corsEnabled = !!allowOrigin;
      const vulnerable = allowOrigin === '*' || allowOrigin === 'https://evil.example.com';

      return {
        success: true,
        result: {
          url,
          corsEnabled,
          allowOrigin,
          allowMethods,
          allowHeaders,
          vulnerable,
        },
      };
    } catch (error) {
      return {
        success: false,
        result: null,
        error: `CORS检查失败: ${(error as Error).message}`,
      };
    }
  }
}
