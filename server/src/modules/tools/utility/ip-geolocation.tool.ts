import { BaseTool, ToolResult } from '../core/base-tool';

export class IpGeoTool extends BaseTool {
  constructor() {
    super('ip_geolocation', 'Lookup IP geolocation info using ip-api.com.');
  }

  async run(params: Record<string, unknown>): Promise<ToolResult> {
    const ip = (params.ip as string | undefined)?.trim() ?? '';
    const url = ip ? `http://ip-api.com/json/${encodeURIComponent(ip)}` : 'http://ip-api.com/json/';

    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': 'secbot-ts/2.0.0' },
      });
      if (!response.ok) {
        return { success: false, result: null, error: `HTTP ${response.status}` };
      }
      const data = (await response.json()) as Record<string, unknown>;
      if (data.status === 'fail') {
        return { success: false, result: null, error: String(data.message ?? 'Lookup failed') };
      }

      return {
        success: true,
        result: {
          ip: data.query,
          country: data.country,
          country_code: data.countryCode,
          region: data.regionName,
          city: data.city,
          zip: data.zip,
          latitude: data.lat,
          longitude: data.lon,
          timezone: data.timezone,
          isp: data.isp,
          org: data.org,
          as_number: data.as,
        },
      };
    } catch (error) {
      return { success: false, result: null, error: (error as Error).message };
    }
  }
}

