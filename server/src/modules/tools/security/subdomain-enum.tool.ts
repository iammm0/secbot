import * as dns from 'dns';
import { BaseTool, ToolResult } from '../core/base-tool';

const COMMON_SUBDOMAINS = [
  'www', 'mail', 'ftp', 'admin', 'api', 'dev', 'staging', 'test', 'blog',
  'shop', 'cdn', 'static', 'app', 'portal', 'secure', 'vpn', 'remote',
  'ns1', 'ns2', 'mx', 'smtp', 'pop', 'imap', 'webmail', 'cpanel', 'whm',
  'git', 'gitlab', 'jenkins', 'ci', 'jira', 'confluence', 'wiki', 'docs',
  'status', 'monitor', 'grafana', 'kibana', 'elastic', 'db', 'mysql',
  'redis', 'mongo', 'postgres', 'mq', 'rabbitmq', 'kafka', 'queue',
  'auth', 'sso', 'login', 'oauth', 'id', 'accounts', 'signup',
  'media', 'assets', 'images', 'img', 'video', 'files', 'upload', 'download',
  'beta', 'alpha', 'sandbox', 'demo', 'preview', 'internal', 'intranet',
  'backup', 'bak', 'old', 'legacy', 'archive', 'temp', 'tmp',
  'm', 'mobile', 'wap', 'api-v2', 'api-v1', 'v1', 'v2',
];

export class SubdomainEnumTool extends BaseTool {
  constructor() {
    super('subdomain_enum', '子域名枚举 — 字典爆破 + crt.sh 证书透明度 + 递归发现');
  }

  async run(params: Record<string, unknown>): Promise<ToolResult> {
    const domain = String(params.domain ?? '').trim();
    if (!domain) return { success: false, result: null, error: '缺少必要参数: domain' };

    const useCrtSh = params.crt_sh !== false;
    const recursive = params.recursive === true;
    const customWordlist = params.wordlist as string[] | undefined;
    const maxResults = Math.min(Number(params.max) || 200, 500);

    try {
      const found = new Map<string, string[]>();

      // 1. Dictionary brute-force
      const wordlist = customWordlist?.length ? customWordlist : COMMON_SUBDOMAINS;
      const bruteResults = await this.bruteForce(domain, wordlist);
      for (const r of bruteResults) found.set(r.subdomain, r.ips);

      // 2. crt.sh certificate transparency
      if (useCrtSh) {
        const crtResults = await this.queryCrtSh(domain);
        for (const sub of crtResults) {
          if (!found.has(sub)) {
            const ips = await this.resolve(sub);
            if (ips.length) found.set(sub, ips);
          }
        }
      }

      // 3. Recursive: for each found subdomain, try common prefixes
      if (recursive && found.size < maxResults) {
        const recursivePrefixes = ['dev', 'staging', 'api', 'admin', 'test', 'internal'];
        const bases = [...found.keys()].slice(0, 10);
        for (const base of bases) {
          for (const prefix of recursivePrefixes) {
            const sub = `${prefix}.${base}`;
            if (found.has(sub) || found.size >= maxResults) continue;
            const ips = await this.resolve(sub);
            if (ips.length) found.set(sub, ips);
          }
        }
      }

      const subdomains = [...found.entries()]
        .slice(0, maxResults)
        .map(([subdomain, ips]) => ({ subdomain, ips }));

      return {
        success: true,
        result: {
          domain,
          methods: ['brute_force', ...(useCrtSh ? ['crt_sh'] : []), ...(recursive ? ['recursive'] : [])],
          total_found: subdomains.length,
          subdomains,
        },
      };
    } catch (error) {
      return { success: false, result: null, error: `子域名枚举失败: ${(error as Error).message}` };
    }
  }

  private async bruteForce(domain: string, wordlist: string[]): Promise<Array<{ subdomain: string; ips: string[] }>> {
    const results = await Promise.allSettled(
      wordlist.map(async (sub) => {
        const fqdn = `${sub}.${domain}`;
        const ips = await dns.promises.resolve4(fqdn);
        return { subdomain: fqdn, ips };
      }),
    );

    return results
      .filter((r): r is PromiseFulfilledResult<{ subdomain: string; ips: string[] }> => r.status === 'fulfilled')
      .map((r) => r.value);
  }

  private async queryCrtSh(domain: string): Promise<string[]> {
    try {
      const resp = await fetch(
        `https://crt.sh/?q=%25.${encodeURIComponent(domain)}&output=json`,
        { signal: AbortSignal.timeout(15000), headers: { 'User-Agent': 'secbot/1.0' } },
      );
      if (!resp.ok) return [];
      const data = await resp.json() as Array<{ name_value: string }>;
      const subs = new Set<string>();
      for (const entry of data) {
        for (const name of entry.name_value.split('\n')) {
          const clean = name.trim().toLowerCase().replace(/^\*\./, '');
          if (clean.endsWith(`.${domain}`) && !clean.includes('*')) {
            subs.add(clean);
          }
        }
      }
      return [...subs].slice(0, 100);
    } catch {
      return [];
    }
  }

  private async resolve(fqdn: string): Promise<string[]> {
    try {
      return await dns.promises.resolve4(fqdn);
    } catch {
      return [];
    }
  }
}
