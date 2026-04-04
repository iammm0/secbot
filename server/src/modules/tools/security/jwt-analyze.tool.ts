import { BaseTool, ToolResult } from '../core/base-tool';

function base64UrlDecode(value: string): string {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = normalized + '='.repeat((4 - (normalized.length % 4 || 4)) % 4);
  return Buffer.from(padded, 'base64').toString('utf8');
}

export class JwtAnalyzeTool extends BaseTool {
  constructor() {
    super('jwt_analyze', 'Decode and analyze JWT token structure and common risks.');
  }

  async run(params: Record<string, unknown>): Promise<ToolResult> {
    const token = (params.token as string | undefined)?.trim();
    if (!token) {
      return { success: false, result: null, error: 'Missing parameter: token' };
    }

    try {
      const parts = token.split('.');
      if (parts.length !== 3) {
        return { success: false, result: null, error: 'Invalid JWT format' };
      }

      const header = JSON.parse(base64UrlDecode(parts[0])) as Record<string, unknown>;
      const payload = JSON.parse(base64UrlDecode(parts[1])) as Record<string, unknown>;
      const signature = parts[2];
      const now = Math.floor(Date.now() / 1000);

      const findings: string[] = [];
      if (String(header.alg ?? '').toLowerCase() === 'none') {
        findings.push('Insecure algorithm: alg=none');
      }
      if (payload.exp && Number(payload.exp) < now) {
        findings.push('Token is expired');
      }
      if (!payload.exp) {
        findings.push('Token has no exp claim');
      }
      if (!payload.iat) {
        findings.push('Token has no iat claim');
      }
      if (!payload.iss) {
        findings.push('Token has no iss claim');
      }
      if (!payload.aud) {
        findings.push('Token has no aud claim');
      }

      return {
        success: true,
        result: {
          valid_format: true,
          header,
          payload,
          signature_length: signature.length,
          findings,
        },
      };
    } catch (error) {
      return {
        success: false,
        result: null,
        error: `JWT parse failed: ${(error as Error).message}`,
      };
    }
  }
}
