import { BaseTool, ToolResult } from '../core/base-tool';

const DEFAULT_PAYLOADS = [
  "' OR '1'='1",
  '<script>alert(1)</script>',
  '../../../etc/passwd',
  '${7*7}',
  '`id`',
];

const DEFAULT_PARAMS = ['id', 'q', 'search', 'page', 'callback', 'redirect', 'url'];

export class ParamFuzzerTool extends BaseTool {
  constructor() {
    super(
      'param_fuzzer',
      'Fuzz URL query parameters with security payloads and compare response behavior.',
    );
  }

  async run(params: Record<string, unknown>): Promise<ToolResult> {
    const url = params.url as string | undefined;
    const payloads = (params.payloads as string[] | undefined) ?? DEFAULT_PAYLOADS;
    const paramNames = (params.params as string[] | undefined) ?? DEFAULT_PARAMS;
    if (!url) {
      return { success: false, result: null, error: 'Missing parameter: url' };
    }

    try {
      const baseline = await fetch(url, { method: 'GET', redirect: 'manual' });
      const baselineLength = Number(baseline.headers.get('content-length') ?? 0);
      const baselineStatus = baseline.status;

      const findings: Array<Record<string, unknown>> = [];

      for (const name of paramNames) {
        for (const payload of payloads) {
          const candidateUrl = new URL(url);
          candidateUrl.searchParams.set(name, payload);
          try {
            const response = await fetch(candidateUrl.toString(), {
              method: 'GET',
              redirect: 'manual',
            });
            const contentLength = Number(response.headers.get('content-length') ?? 0);
            const statusChanged = response.status !== baselineStatus;
            const lengthChanged = Math.abs(contentLength - baselineLength) > 300;
            if (statusChanged || lengthChanged || response.status >= 500) {
              findings.push({
                parameter: name,
                payload,
                status: response.status,
                content_length: contentLength,
                reason: [
                  statusChanged ? 'status_changed' : null,
                  lengthChanged ? 'length_changed' : null,
                  response.status >= 500 ? 'server_error' : null,
                ].filter(Boolean),
              });
            }
          } catch {
            // ignore network errors per case
          }
        }
      }

      return {
        success: true,
        result: {
          url,
          baseline: { status: baselineStatus, content_length: baselineLength },
          tested_cases: paramNames.length * payloads.length,
          suspicious_cases: findings.length,
          findings,
        },
      };
    } catch (error) {
      return { success: false, result: null, error: (error as Error).message };
    }
  }
}
