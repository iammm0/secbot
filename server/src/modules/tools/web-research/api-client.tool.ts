import { BaseTool, ToolResult } from '../core/base-tool';

type ErrorRecord = {
  timestamp: string;
  type: string;
  message: string;
  context: Record<string, unknown>;
};

class ErrorCollector {
  private readonly maxSize: number;
  private readonly errors: ErrorRecord[] = [];

  constructor(maxSize = 100) {
    this.maxSize = maxSize;
  }

  add(errorType: string, message: string, context: Record<string, unknown>): void {
    if (this.errors.length >= this.maxSize) {
      this.errors.shift();
    }
    this.errors.push({
      timestamp: new Date().toISOString(),
      type: errorType,
      message,
      context,
    });
  }

  recent(count = 10): ErrorRecord[] {
    return this.errors.slice(-count);
  }

  stats(): Record<string, unknown> {
    const byType: Record<string, number> = {};
    for (const err of this.errors) {
      byType[err.type] = (byType[err.type] ?? 0) + 1;
    }
    return {
      total_errors: this.errors.length,
      by_type: byType,
      oldest: this.errors[0]?.timestamp ?? null,
      newest: this.errors[this.errors.length - 1]?.timestamp ?? null,
    };
  }

  clear(): void {
    this.errors.length = 0;
  }
}

const ERROR_COLLECTOR = new ErrorCollector();

const API_PRESETS: Record<
  string,
  {
    name: string;
    url_template: string;
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
    headers: Record<string, string>;
    description: string;
  }
> = {
  weather: {
    name: 'Weather (wttr.in)',
    url_template: 'https://wttr.in/{query}?format=j1',
    method: 'GET',
    headers: { Accept: 'application/json' },
    description: 'Get weather info for a city',
  },
  ip_info: {
    name: 'IP Information',
    url_template: 'http://ip-api.com/json/{query}?lang=zh-CN',
    method: 'GET',
    headers: {},
    description: 'Geolocation and network details for an IP',
  },
  ip_self: {
    name: 'Public IP',
    url_template: 'https://httpbin.org/ip',
    method: 'GET',
    headers: {},
    description: 'Get current public IP',
  },
  github_user: {
    name: 'GitHub User',
    url_template: 'https://api.github.com/users/{query}',
    method: 'GET',
    headers: { Accept: 'application/vnd.github+json' },
    description: 'Query GitHub user profile',
  },
  github_repo: {
    name: 'GitHub Repository',
    url_template: 'https://api.github.com/repos/{query}',
    method: 'GET',
    headers: { Accept: 'application/vnd.github+json' },
    description: 'Query GitHub repository info',
  },
  exchange_rate: {
    name: 'Exchange Rate',
    url_template: 'https://open.er-api.com/v6/latest/{query}',
    method: 'GET',
    headers: {},
    description: 'Query currency exchange rates',
  },
  random_fact: {
    name: 'Random Fact',
    url_template: 'https://uselessfacts.jsph.pl/api/v2/facts/random?language=en',
    method: 'GET',
    headers: {},
    description: 'Get a random fact',
  },
  country_info: {
    name: 'Country Info',
    url_template: 'https://restcountries.com/v3.1/name/{query}',
    method: 'GET',
    headers: {},
    description: 'Query country information by name',
  },
  dns_resolve: {
    name: 'DNS Resolve',
    url_template: 'https://dns.google/resolve?name={query}&type=A',
    method: 'GET',
    headers: {},
    description: 'Resolve DNS via Google DNS over HTTPS',
  },
  url_shorten: {
    name: 'Unshorten URL',
    url_template: 'https://unshorten.me/json/{query}',
    method: 'GET',
    headers: {},
    description: 'Expand short URL targets',
  },
};

function ensureString(value: unknown, def = ''): string {
  if (value === null || value === undefined) return def;
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const first =
      obj.city ??
      obj.query ??
      obj.q ??
      (Object.values(obj).length > 0 ? Object.values(obj)[0] : undefined);
    return ensureString(first, def);
  }
  return String(value).trim();
}

function parseObject(input: unknown): Record<string, unknown> {
  if (!input) return {};
  if (typeof input === 'object' && !Array.isArray(input)) {
    return input as Record<string, unknown>;
  }
  if (typeof input === 'string') {
    try {
      const parsed = JSON.parse(input);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return {};
    }
  }
  return {};
}

function parseStringRecord(input: unknown): Record<string, string> {
  const raw = parseObject(input);
  const output: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    output[key] = String(value);
  }
  return output;
}

function parseTimeout(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

type RequestAttemptResult = {
  response: Response;
  elapsedMs: number;
  bodyText: string;
};

export class ApiClientTool extends BaseTool {
  constructor() {
    super(
      'api_client',
      'Generic REST API client supporting custom requests and built-in API presets.',
    );
  }

  async run(params: Record<string, unknown>): Promise<ToolResult> {
    const preset = ensureString(params.preset);
    const query = ensureString(params.query);

    if (preset) {
      return await this.executePreset(preset, query, params);
    }

    const url = ensureString(params.url);
    if (!url) {
      const presets = Object.entries(API_PRESETS).map(([key, value]) => ({
        preset: key,
        name: value.name,
        description: value.description,
      }));
      return {
        success: true,
        result: {
          message: 'No url/preset provided. Available built-in presets:',
          presets,
        },
      };
    }

    return await this.executeCustom(url, params);
  }

  private async executePreset(
    preset: string,
    query: string,
    params: Record<string, unknown>,
  ): Promise<ToolResult> {
    const config = API_PRESETS[preset];
    if (!config) {
      return {
        success: false,
        result: null,
        error: `Unknown preset: ${preset}. Available: ${Object.keys(API_PRESETS).join(', ')}`,
      };
    }

    let finalQuery = query;
    if (config.url_template.includes('{query}') && !finalQuery) {
      if (preset === 'weather') {
        finalQuery = (await this.detectCityFromIp()) || '北京';
      } else {
        return {
          success: false,
          result: null,
          error: `Preset ${preset} requires parameter: query`,
        };
      }
    }

    const url = config.url_template.includes('{query}')
      ? config.url_template.replace('{query}', encodeURIComponent(finalQuery))
      : config.url_template;

    const headers = { ...config.headers, ...parseStringRecord(params.headers) };
    this.applyAuth(
      headers,
      ensureString(params.auth_type, 'none'),
      ensureString(params.auth_value),
    );

    return await this.doRequest({
      url,
      method: config.method,
      headers,
      params: null,
      body: null,
      timeoutSec: parseTimeout(params.timeout),
      presetName: config.name,
    });
  }

  private async executeCustom(url: string, params: Record<string, unknown>): Promise<ToolResult> {
    const method = ensureString(params.method, 'GET').toUpperCase();
    const headers = parseStringRecord(params.headers);
    const queryParams = parseObject(params.params);
    const body = params.body;
    this.applyAuth(
      headers,
      ensureString(params.auth_type, 'none'),
      ensureString(params.auth_value),
    );

    return await this.doRequest({
      url,
      method,
      headers,
      params: Object.keys(queryParams).length > 0 ? queryParams : null,
      body: body ?? null,
      timeoutSec: parseTimeout(params.timeout),
      presetName: '',
    });
  }

  private applyAuth(headers: Record<string, string>, authType: string, authValue: string): void {
    const t = authType.toLowerCase();
    if (t === 'bearer' && authValue) {
      headers.Authorization = `Bearer ${authValue}`;
      return;
    }
    if (t === 'api_key' && authValue) {
      headers['X-API-Key'] = authValue;
    }
  }

  private async doRequest(options: {
    url: string;
    method: string;
    headers: Record<string, string>;
    params: Record<string, unknown> | null;
    body: unknown;
    timeoutSec: number | null;
    presetName: string;
  }): Promise<ToolResult> {
    const timeoutSec = Math.max(1, Math.min(options.timeoutSec ?? 20, 60));
    const maxRetries = 3;

    const context: Record<string, unknown> = {
      url: options.url,
      method: options.method,
      timeout: timeoutSec,
      preset_name: options.presetName,
      params: options.params,
    };

    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= maxRetries; attempt += 1) {
      try {
        const attemptResult = await this.requestAttempt(options, timeoutSec);
        return this.buildSuccessResult(options, attemptResult);
      } catch (error) {
        lastError = error as Error;
        const errType = lastError.name || 'RequestError';
        const msg = `Request failed (attempt ${attempt}/${maxRetries}): ${lastError.message}`;
        ERROR_COLLECTOR.add(errType, msg, { ...context, attempt });
        if (attempt < maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
        }
      }
    }

    return {
      success: false,
      result: {
        url: options.url,
        method: options.method,
        retries: maxRetries,
      },
      error: `Request failed after ${maxRetries} attempts: ${lastError?.message ?? 'unknown error'}`,
    };
  }

  private async requestAttempt(
    options: {
      url: string;
      method: string;
      headers: Record<string, string>;
      params: Record<string, unknown> | null;
      body: unknown;
    },
    timeoutSec: number,
  ): Promise<RequestAttemptResult> {
    const urlObj = new URL(options.url);
    if (options.params) {
      for (const [key, value] of Object.entries(options.params)) {
        urlObj.searchParams.set(key, String(value));
      }
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutSec * 1000);

    let requestBody: string | undefined;
    const headers = { ...options.headers };
    if (
      options.body !== null &&
      options.body !== undefined &&
      options.method !== 'GET' &&
      options.method !== 'HEAD'
    ) {
      if (typeof options.body === 'string') {
        requestBody = options.body;
        if (/^\s*[\[{]/.test(requestBody) && !headers['Content-Type']) {
          headers['Content-Type'] = 'application/json';
        }
      } else {
        requestBody = JSON.stringify(options.body);
        if (!headers['Content-Type']) {
          headers['Content-Type'] = 'application/json';
        }
      }
    }

    const startedAt = Date.now();
    try {
      const response = await fetch(urlObj.toString(), {
        method: options.method,
        headers,
        body: requestBody,
        redirect: 'follow',
        signal: controller.signal,
      });
      const bodyText = await response.text();
      const elapsedMs = Date.now() - startedAt;
      return { response, elapsedMs, bodyText };
    } finally {
      clearTimeout(timer);
    }
  }

  private buildSuccessResult(
    options: {
      url: string;
      method: string;
      presetName: string;
    },
    result: RequestAttemptResult,
  ): ToolResult {
    const response = result.response;
    const contentType = response.headers.get('content-type') ?? '';
    const bodyText = result.bodyText;

    const output: Record<string, unknown> = {
      url: response.url || options.url,
      method: options.method,
      status_code: response.status,
      content_type: contentType,
      elapsed_ms: result.elapsedMs,
      ok: response.ok,
      response_headers: Object.fromEntries([...response.headers.entries()].slice(0, 20)),
    };

    if (options.presetName) {
      output.preset = options.presetName;
    }

    if (!response.ok) {
      output.http_error = {
        status_code: response.status,
        reason: response.statusText,
      };
    }

    let parsedJson: unknown = null;
    try {
      parsedJson = JSON.parse(bodyText);
    } catch {
      parsedJson = null;
    }

    if (parsedJson !== null) {
      const serialized = JSON.stringify(parsedJson);
      if (serialized.length > 5000) {
        if (Array.isArray(parsedJson)) {
          output.data = { items: parsedJson.slice(0, 20) };
        } else {
          output.data = parsedJson;
        }
        output.data_truncated = true;
        output.total_size = serialized.length;
      } else {
        output.data = parsedJson;
      }
    } else {
      output.body_preview = bodyText.slice(0, 3000);
    }

    return { success: true, result: output };
  }

  private async detectCityFromIp(): Promise<string | null> {
    try {
      const ipResp = await fetch('https://httpbin.org/ip', {
        headers: { 'User-Agent': 'secbot-ts/2.0.0' },
      });
      if (!ipResp.ok) return null;
      const ipPayload = (await ipResp.json()) as Record<string, unknown>;
      const origin = ensureString(ipPayload.origin ?? ipPayload.ip ?? '');
      const ip = origin.includes(',') ? origin.split(',')[0].trim() : origin;
      if (!ip) return null;

      const geoResp = await fetch(`http://ip-api.com/json/${encodeURIComponent(ip)}?lang=zh-CN`, {
        headers: { 'User-Agent': 'secbot-ts/2.0.0' },
      });
      if (!geoResp.ok) return null;
      const geoPayload = (await geoResp.json()) as Record<string, unknown>;
      if (ensureString(geoPayload.status) !== 'success') return null;
      return (
        ensureString(geoPayload.city) ||
        ensureString(geoPayload.regionName) ||
        ensureString(geoPayload.country) ||
        null
      );
    } catch {
      return null;
    }
  }

  static getRecentErrors(count = 10): ErrorRecord[] {
    return ERROR_COLLECTOR.recent(count);
  }

  static getErrorStats(): Record<string, unknown> {
    return ERROR_COLLECTOR.stats();
  }

  static clearErrors(): void {
    ERROR_COLLECTOR.clear();
  }
}
