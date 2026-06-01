import { BaseTool, ToolResult } from '../core/base-tool';

type Provider = 'aws' | 'azure' | 'gcp' | 'aliyun';

const PROVIDER_URLS: Record<Provider, (name: string) => string> = {
  aws: (n) => `https://${n}.s3.amazonaws.com/`,
  azure: (n) => `https://${n}.blob.core.windows.net/?comp=list&restype=container`,
  gcp: (n) => `https://storage.googleapis.com/${n}/`,
  aliyun: (n) => `https://${n}.oss-cn-hangzhou.aliyuncs.com/`,
};

const DEFAULT_SUFFIXES = [
  '',
  '-backup',
  '-bak',
  '-dev',
  '-staging',
  '-prod',
  '-assets',
  '-static',
  '-uploads',
  '-data',
  '-logs',
  '-private',
  '-public',
  '-internal',
  '-test',
  '-config',
  '-db',
  '-files',
  '-www',
  '-api',
];

export class CloudBucketEnumTool extends BaseTool {
  constructor() {
    super(
      'cloud_bucket_enum',
      '多云存储桶枚举 — 支持 AWS S3 / Azure Blob / GCP Storage / 阿里云 OSS',
    );
  }

  async run(params: Record<string, unknown>): Promise<ToolResult> {
    const keyword = String(params.keyword ?? '').trim();
    if (!keyword) return { success: false, result: null, error: '缺少必要参数: keyword' };

    const providers = (params.providers as Provider[] | undefined) ?? [
      'aws',
      'azure',
      'gcp',
      'aliyun',
    ];
    const suffixes = Array.isArray(params.suffixes)
      ? params.suffixes.map(String)
      : DEFAULT_SUFFIXES;
    const timeoutMs = Math.min(Number(params.timeout_ms) || 5000, 15000);
    const maxPerProvider = Math.min(Number(params.max) || 50, 200);

    const names = this.generateNames(keyword, suffixes).slice(0, maxPerProvider);
    const allResults: Array<Record<string, unknown>> = [];

    for (const provider of providers) {
      const urlFn = PROVIDER_URLS[provider];
      if (!urlFn) continue;

      const checks = await this.runConcurrent(names, 10, async (name) => {
        return this.checkBucket(provider, name, urlFn(name), timeoutMs);
      });

      allResults.push(...checks.filter((r) => r.exists));
    }

    return {
      success: true,
      result: {
        keyword,
        providers,
        names_tested: names.length * providers.length,
        found: allResults.length,
        accessible: allResults.filter((r) => r.list_accessible).length,
        details: allResults.slice(0, 100),
      },
    };
  }

  private generateNames(keyword: string, suffixes: string[]): string[] {
    const lower = keyword.toLowerCase();
    const set = new Set<string>();
    for (const s of suffixes) {
      set.add(`${lower}${s}`);
    }
    return [...set];
  }

  private async checkBucket(
    provider: Provider,
    name: string,
    url: string,
    timeoutMs: number,
  ): Promise<Record<string, unknown>> {
    const result: Record<string, unknown> = {
      provider,
      bucket: name,
      url,
      exists: false,
      list_accessible: false,
    };

    try {
      const resp = await fetch(url, {
        method: 'GET',
        headers: { 'User-Agent': 'secbot/1.0' },
        redirect: 'manual',
        signal: AbortSignal.timeout(timeoutMs),
      });

      result.status = resp.status;

      if (resp.status === 200) {
        result.exists = true;
        const body = await resp.text();
        if (this.isListable(provider, body)) {
          result.list_accessible = true;
          result.risk = 'high';
          result.preview = body.slice(0, 300);
        }
      } else if (resp.status === 403) {
        result.exists = true;
      } else if (resp.status === 301 || resp.status === 302 || resp.status === 307) {
        result.exists = true;
      }
    } catch {
      /* network error = inconclusive */
    }

    return result;
  }

  private isListable(provider: Provider, body: string): boolean {
    switch (provider) {
      case 'aws':
        return body.includes('<ListBucketResult') || body.includes('<Contents>');
      case 'azure':
        return body.includes('<EnumerationResults') || body.includes('<Blob>');
      case 'gcp':
        return body.includes('<ListBucketResult') || body.includes('<Contents>');
      case 'aliyun':
        return body.includes('<ListBucketResult') || body.includes('<Contents>');
    }
  }

  private async runConcurrent<T, R>(
    items: T[],
    concurrency: number,
    fn: (item: T) => Promise<R>,
  ): Promise<R[]> {
    const results: R[] = new Array(items.length);
    let idx = 0;
    const workers = Array.from({ length: concurrency }, async () => {
      while (idx < items.length) {
        const i = idx++;
        results[i] = await fn(items[i]);
      }
    });
    await Promise.all(workers);
    return results;
  }
}
