import { createLLM } from '../../../common/llm';
import { BaseTool, ToolResult } from '../core/base-tool';
import {
  applySimpleSelector,
  cleanHtmlToText,
  extractLinks,
  extractTitle,
} from '../web-research/html-utils';

export class WebCrawlerTool extends BaseTool {
  constructor() {
    super('web_crawler', 'Crawl a target URL and optionally extract structured info with AI.');
  }

  async run(params: Record<string, unknown>): Promise<ToolResult> {
    const url = String(params.url ?? '').trim();
    const crawlerType = String(params.crawler_type ?? 'simple').trim() || 'simple';
    const extractInfo = this.asBool(params.extract_info, false);
    const extractionSchema = params.extraction_schema;
    const selector = String(params.content_selector ?? '').trim();
    const timeoutMs = Math.max(1_000, Number(params.timeout_ms ?? 20_000));

    if (!url) {
      return { success: false, result: null, error: 'Missing parameter: url' };
    }

    try {
      const page = await this.fetchPage(url, timeoutMs);
      if (!page.html) {
        return { success: false, result: null, error: `Failed to fetch page: ${url}` };
      }

      const focusedHtml = selector ? applySimpleSelector(page.html, selector) : page.html;
      const content = cleanHtmlToText(focusedHtml);

      let extractedInfo: Record<string, unknown> = {};
      if (extractInfo) {
        if (extractionSchema) {
          extractedInfo = await this.extractBySchema(
            page.title,
            page.url,
            content,
            extractionSchema,
          );
        } else {
          const [summary, keywords] = await Promise.all([
            this.generateSummary(content),
            this.generateKeywords(content),
          ]);
          extractedInfo = { summary, keywords };
        }
      }

      return {
        success: true,
        result: {
          url: page.url,
          title: page.title,
          content: content.slice(0, 1000),
          full_content_length: content.length,
          extracted_info: extractedInfo,
          metadata: {
            links_count: extractLinks(page.html, page.url, 1000).length,
            html_length: page.html.length,
            crawler_type: crawlerType,
          },
        },
      };
    } catch (error) {
      return {
        success: false,
        result: null,
        error: `Web crawler failed: ${(error as Error).message}`,
      };
    }
  }

  private asBool(value: unknown, def: boolean): boolean {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
    if (typeof value === 'number') return value !== 0;
    return def;
  }

  private async fetchPage(
    url: string,
    timeoutMs: number,
  ): Promise<{ url: string; html: string; title: string }> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        redirect: 'follow',
        headers: { 'User-Agent': 'secbot-ts/2.0.0' },
        signal: controller.signal,
      });
      if (!response.ok) return { url, html: '', title: '' };
      const html = await response.text();
      const finalUrl = response.url || url;
      return {
        url: finalUrl,
        html,
        title: extractTitle(html),
      };
    } finally {
      clearTimeout(timer);
    }
  }

  private async extractBySchema(
    title: string,
    url: string,
    content: string,
    schema: unknown,
  ): Promise<Record<string, unknown>> {
    const schemaText = typeof schema === 'string' ? schema : JSON.stringify(schema, null, 2);
    const prompt =
      `请从内容中按 schema 提取结构化信息，仅输出 JSON。\n\n` +
      `Title: ${title}\nURL: ${url}\n\n` +
      `Schema:\n${schemaText}\n\n` +
      `Content:\n${content.slice(0, 5000)}\n`;

    try {
      const llm = this.createLlmClient();
      const output = await llm.chat([
        { role: 'system', content: '你是信息提取助手，只输出 JSON。' },
        { role: 'user', content: prompt },
      ]);
      const json = this.extractJsonBlock(output);
      return JSON.parse(json) as Record<string, unknown>;
    } catch (error) {
      return { raw_response: '', error: `schema extraction failed: ${(error as Error).message}` };
    }
  }

  private async generateSummary(content: string): Promise<string> {
    const prompt = `请将以下内容概括为不超过 200 字的中文摘要：\n\n${content.slice(0, 3000)}\n`;
    try {
      const llm = this.createLlmClient();
      const summary = await llm.chat([{ role: 'user', content: prompt }]);
      return summary.trim().slice(0, 200);
    } catch {
      return `${content.slice(0, 200)}...`;
    }
  }

  private async generateKeywords(content: string): Promise<string[]> {
    const prompt =
      `请从以下内容提取 10 个关键词，使用英文逗号分隔，不要额外解释：\n\n` +
      `${content.slice(0, 2000)}\n`;

    try {
      const llm = this.createLlmClient();
      const output = await llm.chat([{ role: 'user', content: prompt }]);
      return output
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, 10);
    } catch {
      return [];
    }
  }

  private createLlmClient() {
    return createLLM({
      provider: process.env.LLM_PROVIDER ?? 'ollama',
      model: process.env.LLM_MODEL,
      baseUrl: process.env.LLM_BASE_URL,
      apiKey: process.env.LLM_API_KEY,
    });
  }

  private extractJsonBlock(text: string): string {
    const objStart = text.indexOf('{');
    const objEnd = text.lastIndexOf('}');
    if (objStart !== -1 && objEnd > objStart) {
      return text.slice(objStart, objEnd + 1);
    }
    const arrStart = text.indexOf('[');
    const arrEnd = text.lastIndexOf(']');
    if (arrStart !== -1 && arrEnd > arrStart) {
      return text.slice(arrStart, arrEnd + 1);
    }
    return '{}';
  }
}
