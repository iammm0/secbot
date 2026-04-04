import { BaseTool, ToolResult } from '../core/base-tool';

export class CertTransparencyTool extends BaseTool {
  constructor() {
    super(
      'cert_transparency',
      'Query certificate transparency logs (crt.sh) to enumerate subdomains.',
    );
  }

  async run(params: Record<string, unknown>): Promise<ToolResult> {
    const domain = String(params.domain ?? '')
      .trim()
      .toLowerCase();
    if (!domain) {
      return { success: false, result: null, error: 'Missing parameter: domain' };
    }

    const url = `https://crt.sh/?q=%25.${encodeURIComponent(domain)}&output=json`;

    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': 'secbot-ts/2.0.0' },
      });
      if (!response.ok) {
        return {
          success: false,
          result: null,
          error: `crt.sh request failed: HTTP ${response.status}`,
        };
      }

      const raw = await response.text();
      const records = JSON.parse(raw) as Array<Record<string, unknown>>;

      const subdomains = new Set<string>();
      const certs: Array<Record<string, unknown>> = [];

      for (const entry of records) {
        const nameValue = String(entry.name_value ?? '');
        for (const line of nameValue.split('\n')) {
          const host = line.trim().toLowerCase();
          if (!host || host.includes('*')) continue;
          subdomains.add(host);
        }

        if (certs.length < 50) {
          certs.push({
            id: entry.id,
            common_name: entry.common_name,
            name_value: nameValue,
            issuer: entry.issuer_name,
            not_before: entry.not_before,
            not_after: entry.not_after,
          });
        }
      }

      const sorted = [...subdomains].sort();
      return {
        success: true,
        result: {
          domain,
          total_certs: records.length,
          unique_subdomains_count: sorted.length,
          subdomains: sorted.slice(0, 200),
          recent_certs: certs.slice(0, 20),
        },
      };
    } catch (error) {
      return {
        success: false,
        result: null,
        error: `Certificate transparency query failed: ${(error as Error).message}`,
      };
    }
  }
}
