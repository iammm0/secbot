import { BaseTool, ToolResult } from '../core/base-tool';

export class ShodanQueryTool extends BaseTool {
  constructor() {
    super('shodan_query', 'Query Shodan host and search APIs for open service intelligence.');
  }

  async run(params: Record<string, unknown>): Promise<ToolResult> {
    const target = String(params.target ?? '').trim();
    const query = String(params.query ?? '').trim();

    if (!target && !query) {
      return { success: false, result: null, error: 'Provide target or query' };
    }

    const apiKey = (process.env.SHODAN_API_KEY ?? '').trim();
    if (!apiKey) {
      return { success: false, result: null, error: 'Missing SHODAN_API_KEY environment variable' };
    }

    try {
      if (target) {
        return await this.queryHost(apiKey, target);
      }
      return await this.querySearch(apiKey, query);
    } catch (error) {
      return {
        success: false,
        result: null,
        error: `Shodan query failed: ${(error as Error).message}`,
      };
    }
  }

  private async queryHost(apiKey: string, target: string): Promise<ToolResult> {
    const url = `https://api.shodan.io/shodan/host/${encodeURIComponent(target)}?key=${encodeURIComponent(apiKey)}`;
    const response = await fetch(url, {
      headers: { 'User-Agent': 'secbot-ts/2.0.0' },
    });

    if (!response.ok) {
      return {
        success: false,
        result: null,
        error: `Shodan host query error: HTTP ${response.status}`,
      };
    }

    const info = (await response.json()) as Record<string, unknown>;
    const services = ((info.data as Array<Record<string, unknown>> | undefined) ?? []).slice(0, 20);
    return {
      success: true,
      result: {
        ip: info.ip_str,
        org: info.org,
        os: info.os,
        country: info.country_name,
        city: info.city,
        ports: info.ports ?? [],
        vulns: info.vulns ?? [],
        hostnames: info.hostnames ?? [],
        services: services.map((item) => ({
          port: item.port,
          transport: item.transport,
          product: item.product,
          version: item.version,
          banner: String(item.data ?? '').slice(0, 200),
        })),
      },
    };
  }

  private async querySearch(apiKey: string, query: string): Promise<ToolResult> {
    const url =
      `https://api.shodan.io/shodan/host/search?key=${encodeURIComponent(apiKey)}` +
      `&query=${encodeURIComponent(query)}&page=1`;

    const response = await fetch(url, {
      headers: { 'User-Agent': 'secbot-ts/2.0.0' },
    });

    if (!response.ok) {
      return {
        success: false,
        result: null,
        error: `Shodan search query error: HTTP ${response.status}`,
      };
    }

    const data = (await response.json()) as Record<string, unknown>;
    const matches = ((data.matches as Array<Record<string, unknown>> | undefined) ?? []).slice(
      0,
      20,
    );

    return {
      success: true,
      result: {
        query,
        total: data.total ?? matches.length,
        matches: matches.map((entry) => ({
          ip: entry.ip_str,
          port: entry.port,
          org: entry.org,
          product: entry.product,
          hostnames: entry.hostnames ?? [],
          banner: String(entry.data ?? '').slice(0, 200),
        })),
      },
    };
  }
}
