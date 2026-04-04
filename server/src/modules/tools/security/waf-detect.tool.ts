import { BaseTool, ToolResult } from '../core/base-tool';

const WAF_SIGNATURES: Array<{ name: string; pattern: RegExp }> = [
  { name: 'Cloudflare', pattern: /cloudflare/i },
  { name: 'Akamai', pattern: /akamai/i },
  { name: 'AWS WAF', pattern: /awselb|x-amzn|aws/i },
  { name: 'Imperva', pattern: /imperva|incapsula/i },
  { name: 'F5 BIG-IP ASM', pattern: /bigip|f5/i },
  { name: 'Sucuri', pattern: /sucuri/i },
  { name: 'FortiWeb', pattern: /fortiweb/i },
  { name: 'ModSecurity', pattern: /mod_security|modsecurity/i },
];

export class WafDetectTool extends BaseTool {
  constructor() {
    super('waf_detect', 'Detect possible WAF/CDN protection based on headers and responses.');
  }

  async run(params: Record<string, unknown>): Promise<ToolResult> {
    const url = params.url as string | undefined;
    if (!url) {
      return { success: false, result: null, error: 'Missing parameter: url' };
    }

    try {
      const baseline = await fetch(url, { method: 'GET', redirect: 'manual' });
      const probeUrl = this.appendQuery(url, 'id', "' OR 1=1 --");
      const probe = await fetch(probeUrl, { method: 'GET', redirect: 'manual' });

      const headerText = [...baseline.headers.entries()].map(([k, v]) => `${k}: ${v}`).join('\n');

      const matched: string[] = [];
      for (const signature of WAF_SIGNATURES) {
        if (signature.pattern.test(headerText)) {
          matched.push(signature.name);
        }
      }

      const suspiciousStatus =
        probe.status === 403 ||
        probe.status === 406 ||
        probe.status === 429 ||
        (probe.status >= 500 && baseline.status < 500);
      const wafLikely = matched.length > 0 || suspiciousStatus;

      return {
        success: true,
        result: {
          url,
          waf_likely: wafLikely,
          matched_signatures: [...new Set(matched)],
          baseline_status: baseline.status,
          probe_status: probe.status,
          baseline_headers: Object.fromEntries(baseline.headers.entries()),
          probe_headers: Object.fromEntries(probe.headers.entries()),
        },
      };
    } catch (error) {
      return { success: false, result: null, error: (error as Error).message };
    }
  }

  private appendQuery(url: string, key: string, value: string): string {
    const u = new URL(url);
    u.searchParams.set(key, value);
    return u.toString();
  }
}
