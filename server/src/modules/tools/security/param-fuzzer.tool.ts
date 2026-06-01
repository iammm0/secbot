import { BaseTool, ToolResult } from '../core/base-tool';

const PAYLOAD_CATEGORIES: Record<string, string[]> = {
  sqli: [
    "'",
    "' OR '1'='1",
    "' OR '1'='1' --",
    "1' AND SLEEP(3)--",
    "1; WAITFOR DELAY '0:0:3'--",
    "' UNION SELECT NULL--",
  ],
  xss: [
    '<script>alert(1)</script>',
    '<img src=x onerror=alert(1)>',
    '<svg/onload=alert(1)>',
    '"><img src=x onerror=alert(1)>',
  ],
  path_traversal: [
    '../../../etc/passwd',
    '..\\..\\..\\windows\\system32\\drivers\\etc\\hosts',
    '....//....//....//etc/passwd',
  ],
  ssti: ['${7*7}', '{{7*7}}', '<%= 7*7 %>', '#{7*7}'],
  cmdi: ['`id`', '$(id)', '; id', '| id', '& id'],
  ssrf: ['http://127.0.0.1', 'http://169.254.169.254/latest/meta-data/', 'http://[::1]'],
};

const DEFAULT_PARAMS = [
  'id',
  'q',
  'search',
  'page',
  'callback',
  'redirect',
  'url',
  'file',
  'path',
  'cmd',
  'exec',
  'template',
  'lang',
];

export class ParamFuzzerTool extends BaseTool {
  constructor() {
    super('param_fuzzer', '参数模糊测试 — 多类型 payload 注入检测，支持时间盲注');
  }

  async run(params: Record<string, unknown>): Promise<ToolResult> {
    const url = String(params.url ?? '').trim();
    if (!url) return { success: false, result: null, error: '缺少必要参数: url' };

    const categories = (params.categories as string[]) ?? Object.keys(PAYLOAD_CATEGORIES);
    const paramNames = (params.params as string[]) ?? DEFAULT_PARAMS;
    const customPayloads = params.payloads as string[] | undefined;
    const timeBasedThreshold = Number(params.time_threshold_ms) || 2500;
    const timeoutMs = Math.min(Number(params.timeout_ms) || 10000, 30000);

    // Build payload list
    const payloads: Array<{ payload: string; category: string }> = [];
    if (customPayloads?.length) {
      for (const p of customPayloads) payloads.push({ payload: p, category: 'custom' });
    } else {
      for (const cat of categories) {
        const list = PAYLOAD_CATEGORIES[cat];
        if (list) for (const p of list) payloads.push({ payload: p, category: cat });
      }
    }

    try {
      // Get baseline
      const baseline = await this.fetchWithTiming(url, timeoutMs);
      const findings: Array<Record<string, unknown>> = [];

      for (const name of paramNames) {
        for (const { payload, category } of payloads) {
          const candidateUrl = new URL(url);
          candidateUrl.searchParams.set(name, payload);

          const result = await this.fetchWithTiming(candidateUrl.toString(), timeoutMs);
          if (!result) continue;

          const reasons: string[] = [];

          // Status change
          if (result.status !== baseline.status) reasons.push('status_changed');

          // Server error
          if (result.status >= 500) reasons.push('server_error');

          // Significant length diff
          const lenDiff = Math.abs(result.length - baseline.length);
          if (lenDiff > 300) reasons.push('length_diff');

          // Reflection detection (XSS)
          if (category === 'xss' && result.body.includes(payload)) reasons.push('reflected');

          // SQL error patterns
          if (category === 'sqli' && /sql|syntax|mysql|postgresql|sqlite|odbc/i.test(result.body)) {
            reasons.push('sql_error_in_response');
          }

          // Time-based blind detection
          if (result.elapsed > timeBasedThreshold && baseline.elapsed < timeBasedThreshold / 2) {
            reasons.push('time_based_delay');
          }

          // SSTI detection
          if (category === 'ssti' && /49|7\*7/.test(result.body) && result.body.includes('49')) {
            reasons.push('ssti_evaluated');
          }

          if (reasons.length) {
            findings.push({
              parameter: name,
              payload,
              category,
              status: result.status,
              content_length: result.length,
              elapsed_ms: result.elapsed,
              reasons,
            });
          }
        }
      }

      return {
        success: true,
        result: {
          url,
          baseline: {
            status: baseline.status,
            content_length: baseline.length,
            elapsed_ms: baseline.elapsed,
          },
          tested_cases: paramNames.length * payloads.length,
          suspicious_cases: findings.length,
          findings,
        },
      };
    } catch (error) {
      return { success: false, result: null, error: (error as Error).message };
    }
  }

  private async fetchWithTiming(
    url: string,
    timeoutMs: number,
  ): Promise<{ status: number; length: number; body: string; elapsed: number }> {
    const start = Date.now();
    const resp = await fetch(url, {
      method: 'GET',
      redirect: 'manual',
      signal: AbortSignal.timeout(timeoutMs),
      headers: { 'User-Agent': 'secbot/1.0' },
    });
    const body = await resp.text();
    const elapsed = Date.now() - start;
    return { status: resp.status, length: body.length, body: body.slice(0, 5000), elapsed };
  }
}
