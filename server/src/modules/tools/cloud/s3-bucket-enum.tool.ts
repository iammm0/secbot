import { BaseTool, ToolResult } from '../core/base-tool';

const DEFAULT_SUFFIXES = [
  '',
  '-backup',
  '-bak',
  '-dev',
  '-staging',
  '-prod',
  '-production',
  '-assets',
  '-static',
  '-media',
  '-uploads',
  '-data',
  '-logs',
  '-private',
  '-public',
  '-internal',
  '-test',
  '-tmp',
  '-temp',
  '-archive',
  '-old',
  '-config',
  '-db',
  '-database',
  '-files',
  '-www',
  '-web',
  '-api',
  '-cdn',
  '-img',
  '-images',
];

export class S3BucketEnumTool extends BaseTool {
  constructor() {
    super('s3_bucket_enum', 'Enumerate potentially exposed AWS S3 bucket names from a keyword.');
  }

  async run(params: Record<string, unknown>): Promise<ToolResult> {
    const keyword = String(params.keyword ?? '').trim();
    const rawWordlist = Array.isArray(params.wordlist) ? params.wordlist : DEFAULT_SUFFIXES;
    const wordlist = rawWordlist.map((item) => String(item));
    const timeoutMs = Number(params.timeout_ms ?? 5_000);
    const maxBuckets = Number(params.max_buckets ?? 100);

    if (!keyword) {
      return { success: false, result: null, error: 'Missing parameter: keyword' };
    }

    const names = this.generateBucketNames(keyword, wordlist).slice(0, Math.max(1, maxBuckets));
    const checks = await this.runWithConcurrency(
      names,
      10,
      async (name) => await this.checkBucket(name, timeoutMs),
    );

    const found = checks.filter((item) => item.exists);
    const accessible = checks.filter((item) => item.list_accessible);

    return {
      success: true,
      result: {
        keyword,
        buckets_tested: names.length,
        buckets_found: found.length,
        buckets_accessible: accessible.length,
        risk_level: accessible.length > 0 ? 'high' : found.length > 0 ? 'medium' : 'low',
        details: checks.slice(0, 50),
      },
    };
  }

  private generateBucketNames(keyword: string, suffixes: string[]): string[] {
    const lower = keyword.toLowerCase();
    const set = new Set<string>();
    for (const suffix of suffixes) {
      set.add(`${keyword}${suffix}`);
      set.add(`${lower}${suffix}`);
      if (!keyword.includes('.')) {
        set.add(suffix ? `${keyword}.${suffix.replace(/^-+/, '')}` : keyword);
      }
    }
    return [...set].sort();
  }

  private async checkBucket(
    bucketName: string,
    timeoutMs: number,
  ): Promise<Record<string, unknown>> {
    const url = `https://${bucketName}.s3.amazonaws.com/`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    const result: Record<string, unknown> = {
      bucket: bucketName,
      url,
      exists: false,
      list_accessible: false,
      status_code: null,
    };

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: { 'User-Agent': 'secbot-ts/2.0.0' },
        redirect: 'manual',
        signal: controller.signal,
      });

      result.status_code = response.status;

      if (response.status === 200) {
        const body = await response.text();
        result.exists = true;
        if (body.includes('<ListBucketResult') || body.includes('<Contents>')) {
          result.list_accessible = true;
          result.risk = 'high';
          result.finding = 'Bucket list operation appears publicly accessible.';
          result.preview = body.slice(0, 500);
        } else {
          result.finding = 'Bucket exists but directory listing is not exposed.';
        }
      } else if (response.status === 403) {
        result.exists = true;
        result.finding = 'Bucket exists (403 Forbidden).';
      } else if (response.status === 301 || response.status === 302 || response.status === 307) {
        result.exists = true;
        result.finding = 'Bucket appears to exist (redirect response).';
      } else if (response.status === 404) {
        result.exists = false;
      }
    } catch {
      // treat network failures as inconclusive
    } finally {
      clearTimeout(timer);
    }

    return result;
  }

  private async runWithConcurrency<TInput, TResult>(
    items: TInput[],
    concurrency: number,
    worker: (item: TInput) => Promise<TResult>,
  ): Promise<TResult[]> {
    const results: TResult[] = new Array(items.length);
    let index = 0;

    const runners = Array.from({ length: Math.max(1, concurrency) }, async () => {
      while (true) {
        const current = index;
        index += 1;
        if (current >= items.length) return;
        results[current] = await worker(items[current]);
      }
    });

    await Promise.all(runners);
    return results;
  }
}
