import { BaseTool, ToolResult } from '../core/base-tool';

const SSRF_PAYLOADS = [
  'http://127.0.0.1:80/',
  'http://localhost/',
  'http://[::1]/',
  'http://169.254.169.254/latest/meta-data/',
  'file:///etc/passwd',
];

export class SsrfDetectTool extends BaseTool {
  constructor() {
    super('ssrf_detect', 'Assess SSRF risk from URL parameters and optionally probe endpoint behavior.');
  }

  async run(params: Record<string, unknown>): Promise<ToolResult> {
    const url = params.url as string | undefined;
    const probe = Boolean(params.probe);
    if (!url) {
      return { success: false, result: null, error: 'Missing parameter: url' };
    }

    try {
      const parsed = new URL(url);
      const riskyParams = [...parsed.searchParams.keys()].filter((k) =>
        /(url|uri|path|dest|destination|target|redirect|callback|next|return)/i.test(k),
      );

      const findings: string[] = [];
      if (riskyParams.length > 0) {
        findings.push(`Potential SSRF-controllable params: ${riskyParams.join(', ')}`);
      }
      if (parsed.protocol !== 'https:') {
        findings.push('Endpoint uses non-HTTPS URL');
      }

      const probeResults: Array<Record<string, unknown>> = [];
      if (probe && riskyParams.length > 0) {
        const baseline = await fetch(url, { method: 'GET', redirect: 'manual' });
        for (const key of riskyParams) {
          for (const payload of SSRF_PAYLOADS) {
            const candidate = new URL(url);
            candidate.searchParams.set(key, payload);
            try {
              const res = await fetch(candidate.toString(), { method: 'GET', redirect: 'manual' });
              if (res.status !== baseline.status || res.status >= 500) {
                probeResults.push({
                  param: key,
                  payload,
                  status: res.status,
                  baseline_status: baseline.status,
                });
              }
            } catch {
              // ignore failures
            }
          }
        }
      }

      return {
        success: true,
        result: {
          url,
          risk_level: probeResults.length > 0 ? 'high' : riskyParams.length > 0 ? 'medium' : 'low',
          findings,
          probe_results: probeResults,
        },
      };
    } catch (error) {
      return { success: false, result: null, error: (error as Error).message };
    }
  }
}

