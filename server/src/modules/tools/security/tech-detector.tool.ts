import { BaseTool, ToolResult } from '../core/base-tool';

const HEADER_SIGNATURES: Record<string, string> = {
  'x-powered-by': 'Server Framework',
  server: 'Web Server',
};

const BODY_SIGNATURES: { pattern: RegExp; tech: string }[] = [
  { pattern: /react/i, tech: 'React' },
  { pattern: /vue/i, tech: 'Vue.js' },
  { pattern: /angular/i, tech: 'Angular' },
  { pattern: /jquery/i, tech: 'jQuery' },
  { pattern: /bootstrap/i, tech: 'Bootstrap' },
  { pattern: /tailwind/i, tech: 'Tailwind CSS' },
  { pattern: /next/i, tech: 'Next.js' },
  { pattern: /nuxt/i, tech: 'Nuxt.js' },
  { pattern: /wordpress/i, tech: 'WordPress' },
  { pattern: /<meta[^>]+generator[^>]+content="([^"]+)"/i, tech: 'CMS' },
];

export class TechDetectorTool extends BaseTool {
  constructor() {
    super('tech_detect', '技术检测 — 识别目标网站使用的技术栈');
  }

  async run(params: Record<string, unknown>): Promise<ToolResult> {
    try {
      const url = params.url as string;
      if (!url) {
        return { success: false, result: null, error: '缺少必要参数: url' };
      }

      const response = await fetch(url);
      const body = await response.text();
      const technologies = new Set<string>();

      for (const [header, label] of Object.entries(HEADER_SIGNATURES)) {
        const value = response.headers.get(header);
        if (value) {
          technologies.add(`${label}: ${value}`);
        }
      }

      for (const { pattern, tech } of BODY_SIGNATURES) {
        const match = body.match(pattern);
        if (match) {
          if (tech === 'CMS' && match[1]) {
            technologies.add(match[1]);
          } else {
            technologies.add(tech);
          }
        }
      }

      return {
        success: true,
        result: { url, technologies: Array.from(technologies) },
      };
    } catch (error) {
      return {
        success: false,
        result: null,
        error: `技术检测失败: ${(error as Error).message}`,
      };
    }
  }
}
