import { BaseTool, ToolResult } from '../core/base-tool';

const SECURITY_HEADERS = [
  'X-Frame-Options',
  'X-Content-Type-Options',
  'Strict-Transport-Security',
  'Content-Security-Policy',
  'X-XSS-Protection',
  'Referrer-Policy',
];

export class HeaderAnalyzerTool extends BaseTool {
  constructor() {
    super('header_analyze', 'HTTP头分析 — 分析目标网站的HTTP安全头配置');
  }

  async run(params: Record<string, unknown>): Promise<ToolResult> {
    try {
      const url = params.url as string;
      if (!url) {
        return { success: false, result: null, error: '缺少必要参数: url' };
      }

      const response = await fetch(url, { method: 'HEAD' });

      const present: string[] = [];
      const missing: string[] = [];

      for (const header of SECURITY_HEADERS) {
        if (response.headers.has(header.toLowerCase())) {
          present.push(header);
        } else {
          missing.push(header);
        }
      }

      const score = Math.round((present.length / SECURITY_HEADERS.length) * 100);

      return {
        success: true,
        result: {
          url,
          headers: { present, missing },
          score,
        },
      };
    } catch (error) {
      return {
        success: false,
        result: null,
        error: `HTTP头分析失败: ${(error as Error).message}`,
      };
    }
  }
}
