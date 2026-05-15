import { createLLM } from '../../../common/llm';
import { BaseTool, ToolResult } from '../core/base-tool';
import { cleanHtmlToText } from './html-utils';

const BROWSER_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';

type SearchResult = {
  title: string;
  url: string;
  snippet: string;
};

export class SmartSearchTool extends BaseTool {
  constructor() {
    super(
      'smart_search',
      'Search the web, fetch top result pages and optionally generate a combined AI summary.',
    );
  }

  async run(params: Record<string, unknown>): Promise<ToolResult> {
    const query = String(params.query ?? '').trim();
    const maxResults = Math.max(1, Math.min(Number(params.max_results ?? 3), 10));
    const summarize = this.asBool(params.summarize, true);

    if (!query) {
      return { success: false, result: null, error: 'Missing parameter: query' };
    }

    try {
      const searchResults = await this.search(query, maxResults);
      if (searchResults.length === 0) {
        return {
          success: true,
          result: { query, message: 'No relevant search results found.', results: [] },
        };
      }

      const pageContents = await this.fetchPages(searchResults);
      const aiSummary = summarize ? await this.summarize(query, pageContents) : '';

      const results = searchResults.map((item, idx) => ({
        title: item.title,
        url: item.url,
        snippet: item.snippet,
        page_content: pageContents[idx] ? pageContents[idx].slice(0, 1500) : '',
      }));

      return {
        success: true,
        result: { query, total: results.length, results, ai_summary: aiSummary },
      };
    } catch (error) {
      return { success: false, result: null, error: `Smart search failed: ${(error as Error).message}` };
    }
  }

  private asBool(value: unknown, def: boolean): boolean {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
    if (typeof value === 'number') return value !== 0;
    return def;
  }

  private async search(query: string, maxResults: number): Promise<SearchResult[]> {
    // Try DuckDuckGo HTML first, fallback to DuckDuckGo Lite
    const results = await this.searchDDGHtml(query, maxResults);
    if (results.length > 0) return results;
    return this.searchDDGLite(query, maxResults);
  }

  private async searchDDGHtml(query: string, maxResults: number): Promise<SearchResult[]> {
    const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
    try {
      const html = await this.fetchWithRetry(url, { headers: { 'User-Agent': BROWSER_UA } });
      if (!html) return [];
      return this.parseDDGHtml(html, maxResults);
    } catch {
      return [];
    }
  }

  private async searchDDGLite(query: string, maxResults: number): Promise<SearchResult[]> {
    const url = `https://lite.duckduckgo.com/lite/?q=${encodeURIComponent(query)}`;
    try {
      const html = await this.fetchWithRetry(url, { headers: { 'User-Agent': BROWSER_UA } });
      if (!html) return [];
      return this.parseDuckDuckGoLite(html, maxResults);
    } catch {
      return [];
    }
  }

  private parseDDGHtml(html: string, maxResults: number): SearchResult[] {
    const resultRegex = /<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    const snippetRegex = /<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/gi;
    const links: Array<{ url: string; title: string }> = [];
    let m: RegExpExecArray | null;
    while ((m = resultRegex.exec(html)) !== null && links.length < maxResults) {
      let rawUrl = String(m[1]).trim();
      // DDG HTML wraps URLs in a redirect; extract the actual URL
      const uddg = rawUrl.match(/[?&]uddg=([^&]+)/);
      if (uddg) rawUrl = decodeURIComponent(uddg[1]);
      if (!/^https?:\/\//i.test(rawUrl)) continue;
      const title = cleanHtmlToText(String(m[2])).slice(0, 280);
      links.push({ url: rawUrl, title });
    }
    const snippets: string[] = [];
    let sm: RegExpExecArray | null;
    while ((sm = snippetRegex.exec(html)) !== null && snippets.length < maxResults) {
      snippets.push(cleanHtmlToText(String(sm[1])).slice(0, 320));
    }
    return links.map((entry, idx) => ({
      title: entry.title,
      url: entry.url,
      snippet: snippets[idx] ?? '',
    }));
  }

  private parseDuckDuckGoLite(html: string, maxResults: number): SearchResult[] {
    const linkRegex = /<a[^>]+rel="nofollow"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi;
    const snippetRegex = /<td[^>]*class="result-snippet"[^>]*>([\s\S]*?)<\/td>/gi;

    const links: Array<{ url: string; title: string }> = [];
    let linkMatch: RegExpExecArray | null;
    while ((linkMatch = linkRegex.exec(html)) !== null && links.length < maxResults) {
      const rawUrl = String(linkMatch[1] ?? '').trim();
      if (!/^https?:\/\//i.test(rawUrl)) continue;
      const title = cleanHtmlToText(String(linkMatch[2] ?? '')).slice(0, 280);
      links.push({ url: rawUrl, title });
    }

    const snippets: string[] = [];
    let snippetMatch: RegExpExecArray | null;
    while ((snippetMatch = snippetRegex.exec(html)) !== null && snippets.length < maxResults) {
      snippets.push(cleanHtmlToText(String(snippetMatch[1] ?? '')).slice(0, 320));
    }

    return links.map((entry, idx) => ({
      title: entry.title,
      url: entry.url,
      snippet: snippets[idx] ?? '',
    }));
  }

  private async fetchWithRetry(
    url: string,
    opts: { headers?: Record<string, string> } = {},
    maxRetries = 2,
    timeoutMs = 15000,
  ): Promise<string | null> {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        const response = await fetch(url, {
          redirect: 'follow',
          headers: { 'User-Agent': BROWSER_UA, ...opts.headers },
          signal: controller.signal,
        });
        clearTimeout(timer);
        if (response.status === 429 || response.status >= 500) {
          if (attempt < maxRetries) { await this.sleep(1500 * (attempt + 1)); continue; }
          return null;
        }
        if (!response.ok) return null;
        return await response.text();
      } catch {
        if (attempt < maxRetries) { await this.sleep(1000 * (attempt + 1)); continue; }
        return null;
      }
    }
    return null;
  }

  private async fetchPages(results: SearchResult[]): Promise<string[]> {
    return this.runWithConcurrency(results, 4, (item) => this.fetchPageContent(item.url));
  }

  private async fetchPageContent(url: string): Promise<string> {
    const html = await this.fetchWithRetry(url, {}, 1, 20000);
    if (!html) return '';
    const text = cleanHtmlToText(html);
    return text.split('\n').slice(0, 200).join('\n');
  }

  private async summarize(query: string, pageContents: string[]): Promise<string> {
    const combined = pageContents
      .filter((item) => item.trim())
      .slice(0, 5)
      .map((item, idx) => `--- Source ${idx + 1} ---\n${item.slice(0, 2000)}`)
      .join('\n');

    if (!combined) return 'No page content was extracted, summary is unavailable.';

    const prompt =
      `Based on the sources below, answer the user query with a concise synthesis.\n\n` +
      `User query: ${query}\n\nSources:\n${combined.slice(0, 6000)}\n\n` +
      `Requirements:\n1) Combine evidence from multiple sources.\n` +
      `2) Mention uncertainty if sources conflict.\n3) Keep within 250 words.\n4) Answer in Chinese.\n`;

    try {
      const llm = createLLM();
      return (await llm.chat([
        { role: 'system', content: '你是专业信息研究助手，擅长综合多源信息并输出简洁结论。' },
        { role: 'user', content: prompt },
      ])).trim();
    } catch (error) {
      return `AI summary failed: ${(error as Error).message}`;
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
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
        const current = index++;
        if (current >= items.length) return;
        outputs[current] = await worker(items[current]);
      }
    });
    await Promise.all(tasks);
    return outputs;
  }
}
