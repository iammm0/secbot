import * as dns from 'dns';
import { BaseTool, ToolResult } from '../core/base-tool';

export class DnsLookupTool extends BaseTool {
  constructor() {
    super('dns_lookup', 'DNS查询 — 查询域名的DNS记录');
  }

  async run(params: Record<string, unknown>): Promise<ToolResult> {
    try {
      const domain = params.domain as string;
      if (!domain) {
        return { success: false, result: null, error: '缺少必要参数: domain' };
      }

      const records: Record<string, unknown> = {};

      const resolvers: { key: string; fn: () => Promise<unknown> }[] = [
        { key: 'A', fn: () => dns.promises.resolve4(domain) },
        { key: 'AAAA', fn: () => dns.promises.resolve6(domain) },
        { key: 'MX', fn: () => dns.promises.resolveMx(domain) },
        { key: 'NS', fn: () => dns.promises.resolveNs(domain) },
        { key: 'TXT', fn: () => dns.promises.resolveTxt(domain) },
      ];

      const results = await Promise.allSettled(
        resolvers.map(async ({ key, fn }) => {
          const data = await fn();
          return { key, data };
        }),
      );

      for (const result of results) {
        if (result.status === 'fulfilled') {
          records[result.value.key] = result.value.data;
        }
      }

      return {
        success: true,
        result: { domain, records },
      };
    } catch (error) {
      return {
        success: false,
        result: null,
        error: `DNS查询失败: ${(error as Error).message}`,
      };
    }
  }
}
