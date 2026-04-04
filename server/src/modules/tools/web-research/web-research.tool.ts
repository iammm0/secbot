import { BaseTool, ToolResult } from '../core/base-tool';
import { ApiClientTool } from './api-client.tool';
import { DeepCrawlTool } from './deep-crawl.tool';
import { PageExtractTool } from './page-extract.tool';
import { SmartSearchTool } from './smart-search.tool';

function ensureString(value: unknown, def = ''): string {
  if (value === null || value === undefined) return def;
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const candidate =
      obj.city ??
      obj.query ??
      obj.q ??
      (Object.values(obj).length > 0 ? Object.values(obj)[0] : undefined);
    return ensureString(candidate, def);
  }
  return String(value).trim();
}

export class WebResearchTool extends BaseTool {
  constructor() {
    super(
      'web_research',
      'Bridge tool for internet research workflows: auto/search/extract/crawl/api.',
    );
  }

  async run(params: Record<string, unknown>): Promise<ToolResult> {
    const query = ensureString(params.query);
    const mode = ensureString(params.mode, 'auto').toLowerCase();
    const url = ensureString(params.url);
    const preset = ensureString(params.preset);

    if (!query && mode === 'auto') {
      return {
        success: false,
        result: null,
        error: 'Missing parameter: query',
      };
    }

    try {
      if (mode === 'auto') {
        return await this.autoResearch(query, params);
      }
      if (mode === 'search') {
        return await this.directSearch(query, params);
      }
      if (mode === 'extract') {
        return await this.directExtract(url, params);
      }
      if (mode === 'crawl') {
        return await this.directCrawl(url, params);
      }
      if (mode === 'api') {
        return await this.directApi(url, preset, query, params);
      }
      return {
        success: false,
        result: null,
        error: `Unsupported mode: ${mode}. Use auto/search/extract/crawl/api`,
      };
    } catch (error) {
      return {
        success: false,
        result: null,
        error: `Web research execution failed: ${(error as Error).message}`,
      };
    }
  }

  private async autoResearch(query: string, params: Record<string, unknown>): Promise<ToolResult> {
    const smart = new SmartSearchTool();
    const result = await smart.run({
      query,
      max_results: params.max_results ?? 3,
      summarize: params.summarize ?? true,
    });

    return {
      success: result.success,
      result: {
        mode: 'auto',
        query,
        report: result.result,
      },
      error: result.error,
    };
  }

  private async directSearch(query: string, params: Record<string, unknown>): Promise<ToolResult> {
    if (!query) {
      return { success: false, result: null, error: 'search mode requires query' };
    }
    const tool = new SmartSearchTool();
    return await tool.run({
      query,
      max_results: params.max_results ?? 3,
      summarize: params.summarize ?? true,
    });
  }

  private async directExtract(url: string, params: Record<string, unknown>): Promise<ToolResult> {
    if (!url) {
      return { success: false, result: null, error: 'extract mode requires url' };
    }
    const tool = new PageExtractTool();
    return await tool.run({
      url,
      mode: params.extract_mode ?? 'text',
      schema: params.schema,
      css_selector: params.css_selector ?? '',
    });
  }

  private async directCrawl(url: string, params: Record<string, unknown>): Promise<ToolResult> {
    if (!url) {
      return { success: false, result: null, error: 'crawl mode requires url' };
    }
    const tool = new DeepCrawlTool();
    return await tool.run({
      start_url: url,
      max_depth: params.max_depth ?? 2,
      max_pages: params.max_pages ?? 10,
      url_pattern: params.url_pattern ?? '',
      extract_info: params.extract_info ?? false,
      same_domain: params.same_domain ?? true,
    });
  }

  private async directApi(
    url: string,
    preset: string,
    query: string,
    params: Record<string, unknown>,
  ): Promise<ToolResult> {
    if (!url && !preset) {
      return { success: false, result: null, error: 'api mode requires url or preset' };
    }
    const tool = new ApiClientTool();
    return await tool.run({
      url,
      preset,
      query,
      method: params.method ?? 'GET',
      headers: params.headers ?? {},
      params: params.params ?? {},
      body: params.body,
      auth_type: params.auth_type ?? 'none',
      auth_value: params.auth_value ?? '',
      timeout: params.timeout,
    });
  }
}
