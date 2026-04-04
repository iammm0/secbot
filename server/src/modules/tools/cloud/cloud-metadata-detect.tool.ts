import { BaseTool, ToolResult } from '../core/base-tool';

type MetadataEndpoint = {
  url: string;
  headers?: Record<string, string>;
  description: string;
};

const METADATA_ENDPOINTS: Record<string, MetadataEndpoint> = {
  AWS: {
    url: 'http://169.254.169.254/latest/meta-data/',
    description: 'AWS EC2 Instance Metadata Service',
  },
  GCP: {
    url: 'http://metadata.google.internal/computeMetadata/v1/',
    headers: { 'Metadata-Flavor': 'Google' },
    description: 'Google Cloud Compute Engine Metadata',
  },
  Azure: {
    url: 'http://169.254.169.254/metadata/instance?api-version=2021-02-01',
    headers: { Metadata: 'true' },
    description: 'Azure Instance Metadata Service',
  },
  DigitalOcean: {
    url: 'http://169.254.169.254/metadata/v1/',
    description: 'DigitalOcean Droplet Metadata',
  },
  Alibaba: {
    url: 'http://100.100.100.200/latest/meta-data/',
    description: 'Alibaba Cloud ECS Metadata',
  },
  Tencent: {
    url: 'http://metadata.tencentyun.com/latest/meta-data/',
    description: 'Tencent Cloud CVM Metadata',
  },
};

export class CloudMetadataDetectTool extends BaseTool {
  constructor() {
    super('cloud_metadata_detect', 'Detect accessible cloud metadata endpoints for SSRF risk assessment.');
  }

  async run(params: Record<string, unknown>): Promise<ToolResult> {
    const target = String(params.target ?? '').trim() || 'localhost';
    const timeoutMs = Number(params.timeout_ms ?? 3_000);
    const providersInput = params.providers;
    const providers = this.normalizeProviders(providersInput);

    const findings = await Promise.all(
      providers
        .filter((name) => METADATA_ENDPOINTS[name])
        .map((name) => this.checkProvider(name, METADATA_ENDPOINTS[name], timeoutMs)),
    );

    const accessible = findings.filter((item) => item.accessible);

    return {
      success: true,
      result: {
        target,
        providers_tested: findings.length,
        accessible_endpoints: accessible.length,
        risk_level: accessible.length > 0 ? 'high' : 'low',
        findings,
        recommendation:
          accessible.length > 0
            ? 'Metadata service is reachable. Enforce IMDSv2 where possible, restrict egress, and review SSRF exposure.'
            : 'No reachable cloud metadata endpoints detected.',
      },
    };
  }

  private normalizeProviders(input: unknown): string[] {
    if (Array.isArray(input)) {
      return input.map((item) => String(item).trim()).filter(Boolean);
    }
    if (typeof input === 'string' && input.trim()) {
      return [input.trim()];
    }
    return Object.keys(METADATA_ENDPOINTS);
  }

  private async checkProvider(
    provider: string,
    endpoint: MetadataEndpoint,
    timeoutMs: number,
  ): Promise<Record<string, unknown>> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(endpoint.url, {
        method: 'GET',
        headers: {
          'User-Agent': 'secbot-ts/2.0.0',
          ...(endpoint.headers ?? {}),
        },
        signal: controller.signal,
      });

      const body = await response.text().catch(() => '');
      return {
        provider,
        endpoint: endpoint.url,
        description: endpoint.description,
        accessible: true,
        status_code: response.status,
        response_preview: body.slice(0, 1000),
        risk: 'high',
      };
    } catch {
      return {
        provider,
        endpoint: endpoint.url,
        description: endpoint.description,
        accessible: false,
        risk: 'none',
      };
    } finally {
      clearTimeout(timer);
    }
  }
}
