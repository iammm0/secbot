import * as dns from 'dns';
import { BaseTool, ToolResult } from '../core/base-tool';

const COMMON_SUBDOMAINS = [
  'www', 'mail', 'ftp', 'admin', 'api', 'dev', 'staging', 'test',
  'blog', 'shop', 'cdn', 'static', 'app', 'portal', 'secure',
];

export class SubdomainEnumTool extends BaseTool {
  constructor() {
    super('subdomain_enum', '子域名枚举 — 枚举目标域名的子域名');
  }

  async run(params: Record<string, unknown>): Promise<ToolResult> {
    try {
      const domain = params.domain as string;
      if (!domain) {
        return { success: false, result: null, error: '缺少必要参数: domain' };
      }

      const results = await Promise.allSettled(
        COMMON_SUBDOMAINS.map(async (sub) => {
          const fqdn = `${sub}.${domain}`;
          const ips = await dns.promises.resolve4(fqdn);
          return { subdomain: fqdn, ip: ips[0] };
        }),
      );

      const subdomains = results
        .filter((r): r is PromiseFulfilledResult<{ subdomain: string; ip: string }> =>
          r.status === 'fulfilled',
        )
        .map((r) => r.value);

      return {
        success: true,
        result: { domain, subdomains },
      };
    } catch (error) {
      return {
        success: false,
        result: null,
        error: `子域名枚举失败: ${(error as Error).message}`,
      };
    }
  }
}
