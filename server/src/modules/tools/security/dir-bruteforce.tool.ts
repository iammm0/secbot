import { BaseTool, ToolResult } from '../core/base-tool';

const DEFAULT_WORDLIST = [
  'admin',
  'login',
  'dashboard',
  'api',
  'robots.txt',
  'sitemap.xml',
  '.env',
  '.git',
  'backup',
  'phpinfo.php',
];

export class DirBruteforceTool extends BaseTool {
  constructor() {
    super('dir_bruteforce', 'Discover common directories and files on a target web server.');
  }

  async run(params: Record<string, unknown>): Promise<ToolResult> {
    const url = params.url as string | undefined;
    const wordlist = (params.wordlist as string[] | undefined) ?? DEFAULT_WORDLIST;
    const timeoutMs = Number(params.timeout_ms ?? 3000);
    if (!url) {
      return { success: false, result: null, error: 'Missing parameter: url' };
    }

    try {
      const base = url.endsWith('/') ? url.slice(0, -1) : url;
      const findings: Array<Record<string, unknown>> = [];
      for (const entry of wordlist) {
        const target = `${base}/${entry.replace(/^\/+/, '')}`;
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
          const response = await fetch(target, { method: 'GET', signal: controller.signal, redirect: 'manual' });
          if (response.status < 400 || [401, 403].includes(response.status)) {
            findings.push({
              path: `/${entry.replace(/^\/+/, '')}`,
              status: response.status,
              content_type: response.headers.get('content-type'),
              length: response.headers.get('content-length'),
            });
          }
        } catch {
          // ignore unreachable paths
        } finally {
          clearTimeout(timer);
        }
      }
      return {
        success: true,
        result: {
          url: base,
          tested: wordlist.length,
          discovered: findings.length,
          findings,
        },
      };
    } catch (error) {
      return { success: false, result: null, error: (error as Error).message };
    }
  }
}

