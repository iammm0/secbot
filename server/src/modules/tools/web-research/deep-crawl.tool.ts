import { createLLM } from '../../../common/llm';
import { BaseTool, ToolResult } from '../core/base-tool';
import { cleanHtmlToText, extractLinks, extractTitle, normalizeUrlForVisit } from './html-utils';

type CrawlPage = {
  url: string;
  depth: number;
  title: string;
  content_preview: string;
  content_length: number;
  links_found: number;
  links: Array<{ url: string; text: string }>;
  ai_summary?: string;
};

export class DeepCrawlTool extends BaseTool {
  constructor() {
    super(
      'deep_crawl',
      'Breadth-first crawl from a start URL with depth, page count, domain and pattern controls.',
    );
  }

  async run(params: Record<string, unknown>): Promise<ToolResult> {
    const startUrl = String(params.start_url ?? '').trim();
    if (!startUrl) {
      return { success: false, result: null, error: 'Missing parameter: start_url' };
    }

    const maxDepth = Math.max(0, Math.min(Number(params.max_depth ?? 2), 5));
    const maxPages = Math.max(1, Math.min(Number(params.max_pages ?? 10), 50));
    const urlPattern = String(params.url_pattern ?? '').trim();
    const sameDomain = this.asBool(params.same_domain, true);
    const extractInfo = this.asBool(params.extract_info, false);
    const timeoutMs = Math.max(1000, Number(params.timeout_ms ?? 15_000));

    let pattern: RegExp | null = null;
    if (urlPattern) {
      try {
        pattern = new RegExp(urlPattern);
      } catch {
        return { success: false, result: null, error: `Invalid url_pattern regex: ${urlPattern}` };
      }
    }

    try {
      const pages = await this.bfsCrawl(
        startUrl,
        maxDepth,
        maxPages,
        pattern,
        sameDomain,
        extractInfo,
        timeoutMs,
      );
      return {
        success: true,
        result: {
          start_url: startUrl,
          max_depth: maxDepth,
          pages_crawled: pages.length,
          pages,
        },
      };
    } catch (error) {
      return {
        success: false,
        result: null,
        error: `Deep crawl failed: ${(error as Error).message}`,
      };
    }
  }

  private asBool(value: unknown, def: boolean): boolean {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
    if (typeof value === 'number') return value !== 0;
    return def;
  }

  private async bfsCrawl(
    startUrl: string,
    maxDepth: number,
    maxPages: number,
    pattern: RegExp | null,
    sameDomain: boolean,
    extractInfo: boolean,
    timeoutMs: number,
  ): Promise<CrawlPage[]> {
    const results: CrawlPage[] = [];
    const visited = new Set<string>();
    const queue: Array<{ url: string; depth: number }> = [];

    const start = new URL(startUrl);
    const baseDomain = start.hostname.toLowerCase();

    queue.push({ url: start.toString(), depth: 0 });
    visited.add(normalizeUrlForVisit(start.toString()));

    while (queue.length > 0 && results.length < maxPages) {
      const currentDepth = queue[0].depth;
      const batch: Array<{ url: string; depth: number }> = [];

      while (
        queue.length > 0 &&
        queue[0].depth === currentDepth &&
        batch.length < maxPages - results.length
      ) {
        const item = queue.shift();
        if (item) batch.push(item);
      }

      const pageResults = await this.runWithConcurrency(
        batch,
        5,
        async (item) => await this.crawlPage(item.url, item.depth, extractInfo, timeoutMs),
      );

      for (const pageResult of pageResults) {
        if (!pageResult) continue;
        results.push(pageResult);

        if (pageResult.depth >= maxDepth) continue;

        for (const link of pageResult.links) {
          const linkUrl = link.url;
          const normalized = normalizeUrlForVisit(linkUrl);
          if (!linkUrl || visited.has(normalized)) continue;

          let parsed: URL;
          try {
            parsed = new URL(linkUrl);
          } catch {
            continue;
          }

          if (sameDomain && parsed.hostname.toLowerCase() !== baseDomain) continue;
          if (pattern && !pattern.test(linkUrl)) continue;

          visited.add(normalized);
          queue.push({ url: linkUrl, depth: pageResult.depth + 1 });

          if (visited.size > maxPages * 3) break;
        }
      }
    }

    return results.slice(0, maxPages);
  }

  private async crawlPage(
    url: string,
    depth: number,
    extractInfo: boolean,
    timeoutMs: number,
  ): Promise<CrawlPage | null> {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      const response = await fetch(url, {
        redirect: 'follow',
        headers: { 'User-Agent': 'secbot-ts/2.0.0' },
        signal: controller.signal,
      });
      clearTimeout(timer);

      if (!response.ok) return null;

      const contentType = response.headers.get('content-type') ?? '';
      if (!/text\/html|application\/xhtml\+xml/i.test(contentType)) {
        return null;
      }

      const html = await response.text();
      const finalUrl = response.url || url;
      const title = extractTitle(html);
      const content = cleanHtmlToText(html);
      const links = extractLinks(html, finalUrl, 30);

      const page: CrawlPage = {
        url: finalUrl,
        depth,
        title,
        content_preview: content.slice(0, 800),
        content_length: content.length,
        links_found: links.length,
        links: links.map((item) => ({ url: item.url, text: item.text })),
      };

      if (extractInfo && content.trim()) {
        const summary = await this.summarizePage(title, content.slice(0, 2000));
        if (summary) page.ai_summary = summary;
      }

      return page;
    } catch {
      return null;
    }
  }

  private async summarizePage(title: string, content: string): Promise<string> {
    const prompt =
      `请用 1-2 句话概括网页主题与关键信息。\n\n` +
      `标题: ${title}\n` +
      `内容:\n${content}\n\n` +
      `简要摘要:`;

    try {
      const llm = createLLM({
        provider: process.env.LLM_PROVIDER ?? 'ollama',
        model: process.env.LLM_MODEL,
        baseUrl: process.env.LLM_BASE_URL,
        apiKey: process.env.LLM_API_KEY,
      });
      const result = await llm.chat([{ role: 'user', content: prompt }]);
      return result.trim();
    } catch {
      return '';
    }
  }

  private async runWithConcurrency<TInput, TResult>(
    items: TInput[],
    concurrency: number,
    worker: (item: TInput) => Promise<TResult>,
  ): Promise<TResult[]> {
    const outputs: TResult[] = new Array(items.length);
    let index = 0;

    const tasks = Array.from({ length: Math.max(1, concurrency) }, async () => {
      while (true) {
        const current = index;
        index += 1;
        if (current >= items.length) return;
        outputs[current] = await worker(items[current]);
      }
    });

    await Promise.all(tasks);
    return outputs;
  }
}
