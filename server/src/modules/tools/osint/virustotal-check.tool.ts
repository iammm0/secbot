import { BaseTool, ToolResult } from '../core/base-tool';

const TYPE_PATH: Record<string, string> = {
  ip: 'ip_addresses',
  domain: 'domains',
  url: 'urls',
  hash: 'files',
};

export class VirusTotalCheckTool extends BaseTool {
  constructor() {
    super('virustotal_check', 'Check IP/domain/URL/hash reputation using VirusTotal API v3.');
  }

  async run(params: Record<string, unknown>): Promise<ToolResult> {
    const target = String(params.target ?? '').trim();
    const scanType = String(params.type ?? '').trim().toLowerCase();
    const apiKey = (process.env.VIRUSTOTAL_API_KEY ?? '').trim();

    if (!target) {
      return { success: false, result: null, error: 'Missing parameter: target' };
    }
    if (!TYPE_PATH[scanType]) {
      return {
        success: false,
        result: null,
        error: `Invalid parameter type. Allowed: ${Object.keys(TYPE_PATH).join(', ')}`,
      };
    }
    if (!apiKey) {
      return { success: false, result: null, error: 'Missing VIRUSTOTAL_API_KEY environment variable' };
    }

    const resource =
      scanType === 'url' ? Buffer.from(target, 'utf8').toString('base64url').replace(/=+$/, '') : target;
    const url = `https://www.virustotal.com/api/v3/${TYPE_PATH[scanType]}/${encodeURIComponent(resource)}`;

    try {
      const response = await fetch(url, {
        headers: {
          'x-apikey': apiKey,
          Accept: 'application/json',
          'User-Agent': 'secbot-ts/2.0.0',
        },
      });

      if (response.status === 404) {
        return {
          success: true,
          result: { target, type: scanType, message: 'Target not found in VirusTotal dataset' },
        };
      }
      if (!response.ok) {
        return {
          success: false,
          result: null,
          error: `VirusTotal API error: HTTP ${response.status}`,
        };
      }

      const data = (await response.json()) as Record<string, unknown>;
      const attrs =
        ((data.data as Record<string, unknown> | undefined)?.attributes as Record<string, unknown> | undefined) ??
        {};
      const stats = (attrs.last_analysis_stats as Record<string, number> | undefined) ?? {};

      const result: Record<string, unknown> = {
        target,
        type: scanType,
        reputation: attrs.reputation,
        analysis_stats: stats,
        malicious: stats.malicious ?? 0,
        suspicious: stats.suspicious ?? 0,
        harmless: stats.harmless ?? 0,
        undetected: stats.undetected ?? 0,
        tags: attrs.tags ?? [],
      };

      if (scanType === 'ip') {
        result.country = attrs.country;
        result.as_owner = attrs.as_owner;
        result.network = attrs.network;
      } else if (scanType === 'domain') {
        result.registrar = attrs.registrar;
        result.creation_date = attrs.creation_date;
        result.whois = String(attrs.whois ?? '').slice(0, 500);
      } else if (scanType === 'hash') {
        result.file_type = attrs.type_description;
        result.size = attrs.size;
        result.names = (attrs.names as unknown[] | undefined)?.slice(0, 10) ?? [];
        result.sha256 = attrs.sha256;
      }

      return { success: true, result };
    } catch (error) {
      return {
        success: false,
        result: null,
        error: `VirusTotal check failed: ${(error as Error).message}`,
      };
    }
  }
}
