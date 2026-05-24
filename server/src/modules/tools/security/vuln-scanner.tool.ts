import { spawn } from 'node:child_process';
import { BaseTool, ToolResult } from '../core/base-tool';
import { VulnDbService } from '../../vuln-db/vuln-db.service';

interface ServiceInfo {
  port: number;
  service?: string;
  product?: string;
  version?: string;
}

export class VulnScannerTool extends BaseTool {
  constructor(private readonly vulnDb?: VulnDbService) {
    super('vuln_scan', '漏洞扫描 — 基于服务指纹匹配已知 CVE，可选 nmap 版本探测');
  }

  async run(params: Record<string, unknown>): Promise<ToolResult> {
    const host = String(params.host ?? '').trim();
    if (!host) {
      return { success: false, result: null, error: '缺少必要参数: host' };
    }

    const ports = params.ports as number[] | undefined;
    const services = params.services as ServiceInfo[] | undefined;
    const useNmap = params.use_nmap !== false;
    const limit = Math.min(Number(params.limit) || 5, 20);

    try {
      let targets: ServiceInfo[];

      if (services?.length) {
        targets = services;
      } else if (useNmap) {
        targets = await this.nmapVersionScan(host, ports);
      } else {
        targets = (ports ?? [80, 443, 22, 3306, 5432, 6379, 8080]).map((p) => ({
          port: p,
          service: undefined,
          product: undefined,
          version: undefined,
        }));
      }

      if (!targets.length) {
        return { success: true, result: { host, vulnerabilities: [], note: '未发现开放服务' } };
      }

      const vulnerabilities = await this.matchVulns(targets, limit);

      return {
        success: true,
        result: {
          host,
          services_scanned: targets.length,
          services: targets,
          vulnerabilities,
          total_cves: vulnerabilities.length,
        },
      };
    } catch (error) {
      return { success: false, result: null, error: `漏洞扫描失败: ${(error as Error).message}` };
    }
  }

  private async matchVulns(
    services: ServiceInfo[],
    limit: number,
  ): Promise<Array<Record<string, unknown>>> {
    if (!this.vulnDb) {
      return [{ note: 'VulnDbService 未注入，无法查询漏洞库。仅返回服务指纹。' }];
    }

    const results: Array<Record<string, unknown>> = [];

    for (const svc of services) {
      if (!svc.product) continue;

      const query = svc.version
        ? `${svc.product} ${svc.version}`
        : svc.product;

      const vulns = await this.vulnDb.search_natural_language(query, limit);

      for (const v of vulns) {
        results.push({
          port: svc.port,
          service: svc.service,
          product: svc.product,
          version: svc.version,
          cve_id: v.vuln_id,
          title: v.title,
          severity: v.severity,
          cvss: v.cvss_score,
          description: v.description.slice(0, 300),
          exploits_available: v.exploits.length > 0,
          references: v.references.slice(0, 3),
        });
      }
    }

    return results;
  }

  private nmapVersionScan(host: string, ports?: number[]): Promise<ServiceInfo[]> {
    return new Promise((resolve) => {
      const args = ['-sV', '--version-intensity', '5', '-oX', '-', '-T4'];
      if (ports?.length) {
        args.push('-p', ports.join(','));
      } else {
        args.push('--top-ports', '100');
      }
      args.push(host);

      const child = spawn('nmap', args, { shell: false, windowsHide: true });
      let stdout = '';
      let done = false;

      child.stdout.setEncoding('utf8');
      child.stdout.on('data', (c) => { stdout += c; });

      const timer = setTimeout(() => {
        if (done) return;
        done = true;
        child.kill('SIGTERM');
        resolve([]);
      }, 90_000);

      child.on('error', () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve([]);
      });

      child.on('close', () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve(this.parseNmapServices(stdout));
      });
    });
  }

  private parseNmapServices(xml: string): ServiceInfo[] {
    const results: ServiceInfo[] = [];
    const portMatches = xml.match(/<port\b[^>]*>[\s\S]*?<\/port>/g) ?? [];

    for (const block of portMatches) {
      const stateMatch = block.match(/<state\b[^>]*state="([^"]*)"/);
      if (stateMatch?.[1] !== 'open') continue;

      const portId = block.match(/<port\b[^>]*portid="(\d+)"/)?.[1];
      const service = block.match(/<service\b[^>]*name="([^"]*)"/)?.[1];
      const product = block.match(/<service\b[^>]*product="([^"]*)"/)?.[1];
      const version = block.match(/<service\b[^>]*version="([^"]*)"/)?.[1];

      results.push({
        port: Number(portId),
        service,
        product: product || service,
        version: version || undefined,
      });
    }
    return results;
  }
}
