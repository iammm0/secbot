import { createLLM } from '../../../common/llm';
import { BaseTool, ToolResult } from '../core/base-tool';
import {
  applySimpleSelector,
  cleanHtmlToText,
  extractHeadings,
  extractImages,
  extractLinks,
  extractMetaTags,
  extractTables,
  extractLists,
  extractTitle,
} from './html-utils';

export class PageExtractTool extends BaseTool {
  constructor() {
    super('page_extract', 'Extract page content in text/structured/custom mode from a target URL.');
  }

  async run(params: Record<string, unknown>): Promise<ToolResult> {
    const url = String(params.url ?? '').trim();
    const mode = String(params.mode ?? 'text')
      .trim()
      .toLowerCase();
    const schema = params.schema;
    const selector = String(params.css_selector ?? '').trim();

    if (!url) {
      return { success: false, result: null, error: 'Missing parameter: url' };
    }
    if (!['text', 'structured', 'custom'].includes(mode)) {
      return { success: false, result: null, error: `Unsupported mode: ${mode}` };
    }

    try {
      const page = await this.fetchPage(url, Number(params.timeout_ms ?? 20_000));
      if (!page.html) {
        return { success: false, result: null, error: `Unable to fetch page: ${url}` };
      }

      const focusedHtml = selector ? applySimpleSelector(page.html, selector) : page.html;
      if (mode === 'structured') {
        return { success: true, result: this.extractStructured(focusedHtml, page.url, page.title) };
      }
      if (mode === 'custom') {
        if (!schema) {
          return { success: false, result: null, error: 'custom mode requires parameter: schema' };
        }
        const custom = await this.extractCustom(focusedHtml, page.url, page.title, schema);
        return { success: true, result: custom };
      }
      return { success: true, result: this.extractText(focusedHtml, page.url, page.title) };
    } catch (error) {
      return {
        success: false,
        result: null,
        error: `Page extraction failed: ${(error as Error).message}`,
      };
    }
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
      if (!response.ok) {
        return { url, html: '', title: '' };
      }
      const html = await response.text();
      const finalUrl = response.url || url;
      const title = extractTitle(html);
      return { url: finalUrl, html, title };
    } finally {
      clearTimeout(timer);
    }
  }

  private extractText(html: string, url: string, title: string): Record<string, unknown> {
    const content = cleanHtmlToText(html);
    const links = extractLinks(html, url, 20);
    const images = extractImages(html, url, 10);
    return {
      url,
      title,
      content: content.slice(0, 5000),
      content_length: content.length,
      links_count: links.length,
      links,
      images_count: images.length,
      images,
    };
  }

  private extractStructured(html: string, url: string, title: string): Record<string, unknown> {
    return {
      url,
      title,
      headings: extractHeadings(html, 50),
      tables: extractTables(html, 10),
      lists: extractLists(html, 20),
      meta: extractMetaTags(html, 20),
    };
  }

  private async extractCustom(
    html: string,
    url: string,
    title: string,
    schema: unknown,
  ): Promise<Record<string, unknown>> {
    const text = cleanHtmlToText(html).slice(0, 5000);
    let schemaText = '';
    if (typeof schema === 'string') {
      schemaText = schema;
    } else {
      schemaText = JSON.stringify(schema, null, 2);
    }

    const prompt =
      `请从网页内容中按给定 schema 提取结构化信息，仅输出 JSON。\n\n` +
      `Title: ${title}\nURL: ${url}\n\n` +
      `Schema:\n${schemaText}\n\n` +
      `Page Content:\n${text}\n`;

    let extractedRaw = '';
    try {
      const llm = createLLM({
        provider: process.env.LLM_PROVIDER ?? 'ollama',
        model: process.env.LLM_MODEL,
        baseUrl: process.env.LLM_BASE_URL,
        apiKey: process.env.LLM_API_KEY,
      });
      extractedRaw = await llm.chat([
        { role: 'system', content: '你是信息提取助手，只返回 JSON，不要解释。' },
        { role: 'user', content: prompt },
      ]);
    } catch (error) {
      return {
        url,
        title,
        schema,
        extracted_data: {
          raw_response: '',
          error: `AI extraction failed: ${(error as Error).message}`,
        },
      };
    }

    const jsonText = this.extractJsonBlock(extractedRaw);
    try {
      return {
        url,
        title,
        schema,
        extracted_data: JSON.parse(jsonText),
      };
    } catch {
      return {
        url,
        title,
        schema,
        extracted_data: { raw_response: extractedRaw },
      };
    }
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
