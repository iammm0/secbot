import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { NetworkAnalyzeTool } from './network-analyze.tool';
import { BaseTool, ToolResult } from '../core/base-tool';

type Severity = 'low' | 'medium' | 'high' | 'critical';
type Vulnerability = {
  id: string;
  title: string;
  severity: Severity;
  category: 'system' | 'network' | 'application';
  description: string;
  recommendation: string;
  evidence?: string;
};

function add(bySeverity: Record<string, number>, severity: Severity): void {
  bySeverity[severity] = (bySeverity[severity] ?? 0) + 1;
}

function parseScanType(value: unknown): 'system' | 'network' | 'application' | 'all' {
  const raw = String(value ?? 'all').toLowerCase();
  if (raw === 'system' || raw === 'network' || raw === 'application' || raw === 'all') {
    return raw;
  }
  return 'all';
}

export class SelfVulnScanTool extends BaseTool {
  constructor() {
    super(
      'self_vuln_scan',
      'Scan local host security posture across system, network and application dimensions.',
    );
  }

  async run(params: Record<string, unknown>): Promise<ToolResult> {
    const scanType = parseScanType(params.scan_type);
    const vulnerabilities: Vulnerability[] = [];

    try {
      if (scanType === 'all' || scanType === 'system') {
        vulnerabilities.push(...this.scanSystemVulnerabilities());
      }
      if (scanType === 'all' || scanType === 'network') {
        vulnerabilities.push(...(await this.scanNetworkVulnerabilities()));
      }
      if (scanType === 'all' || scanType === 'application') {
        vulnerabilities.push(...(await this.scanApplicationVulnerabilities()));
      }

      const bySeverity: Record<string, number> = {};
      for (const item of vulnerabilities) {
        add(bySeverity, item.severity);
      }

      return {
        success: true,
        result: {
          scan_type: scanType,
          total_vulnerabilities: vulnerabilities.length,
          by_severity: bySeverity,
          vulnerabilities,
        },
      };
    } catch (error) {
      return {
        success: false,
        result: null,
        error: (error as Error).message,
      };
    }
  }

  private scanSystemVulnerabilities(): Vulnerability[] {
    const findings: Vulnerability[] = [];
    const nodeMajor = Number(process.versions.node.split('.')[0] ?? '0');
    if (Number.isFinite(nodeMajor) && nodeMajor > 0 && nodeMajor < 24) {
      findings.push({
        id: 'SYS-OLD-NODE',
        title: 'Outdated Node.js runtime',
        severity: 'high',
        category: 'system',
        description: `Current Node.js version is ${process.versions.node}, below supported baseline.`,
        recommendation: 'Upgrade runtime to Node.js 24+ and apply latest security patches.',
      });
    }

    if (
      process.platform !== 'win32' &&
      typeof process.getuid === 'function' &&
      process.getuid() === 0
    ) {
      findings.push({
        id: 'SYS-RUN-AS-ROOT',
        title: 'Process running as root',
        severity: 'medium',
        category: 'system',
        description: 'Service is running with UID 0, increasing blast radius if compromised.',
        recommendation: 'Run service as a dedicated non-privileged user.',
      });
    }

    if ((process.env.NODE_ENV ?? '').toLowerCase() !== 'production') {
      findings.push({
        id: 'SYS-NON-PROD-MODE',
        title: 'Non-production runtime mode',
        severity: 'low',
        category: 'system',
        description: 'NODE_ENV is not set to production.',
        recommendation: 'Set NODE_ENV=production for production deployments.',
      });
    }

    return findings;
  }

  private async scanNetworkVulnerabilities(): Promise<Vulnerability[]> {
    const findings: Vulnerability[] = [];
    const analyzer = new NetworkAnalyzeTool();
    const result = await analyzer.run({ include_traffic: false });
    if (!result.success || !result.result || typeof result.result !== 'object') {
      return findings;
    }

    const listening = (result.result as Record<string, unknown>).listening;
    if (Array.isArray(listening)) {
      const exposed = listening
        .map((item) =>
          item && typeof item === 'object' ? (item as Record<string, unknown>) : null,
        )
        .filter((item): item is Record<string, unknown> => !!item)
        .filter((item) => String(item.local ?? '').startsWith('0.0.0.0:'));

      for (const item of exposed.slice(0, 20)) {
        const local = String(item.local ?? '');
        const port = local.split(':').pop() ?? '';
        const risky = ['21', '22', '23', '445', '3389', '5900'].includes(port);
        if (risky) {
          findings.push({
            id: `NET-EXPOSED-${port}`,
            title: `Public listening on risky port ${port}`,
            severity: 'high',
            category: 'network',
            description: `Service listening on ${local} may be externally reachable.`,
            recommendation:
              'Restrict exposure via firewall, ACL, or bind service to private interface only.',
            evidence: JSON.stringify(item),
          });
        }
      }
    }

    const suspiciousCount = Number(
      (result.result as Record<string, unknown>).suspicious_count ?? 0,
    );
    if (suspiciousCount > 0) {
      findings.push({
        id: 'NET-SUSPICIOUS-CONNECTIONS',
        title: 'Suspicious external network connections detected',
        severity: suspiciousCount > 10 ? 'high' : 'medium',
        category: 'network',
        description: `Detected ${suspiciousCount} suspicious established connections.`,
        recommendation: 'Investigate destination IPs and isolate unknown processes.',
      });
    }

    return findings;
  }

  private async scanApplicationVulnerabilities(): Promise<Vulnerability[]> {
    const findings: Vulnerability[] = [];
    try {
      const packagePath = join(process.cwd(), 'package.json');
      const raw = await readFile(packagePath, 'utf8');
      const pkg = JSON.parse(raw) as Record<string, unknown>;
      const deps = {
        ...(typeof pkg.dependencies === 'object' && pkg.dependencies
          ? (pkg.dependencies as Record<string, unknown>)
          : {}),
        ...(typeof pkg.devDependencies === 'object' && pkg.devDependencies
          ? (pkg.devDependencies as Record<string, unknown>)
          : {}),
      };

      for (const [name, version] of Object.entries(deps)) {
        const v = String(version);
        if (v === '*' || v.toLowerCase() === 'latest') {
          findings.push({
            id: `APP-UNPINNED-${name}`,
            title: `Unpinned dependency: ${name}`,
            severity: 'medium',
            category: 'application',
            description: `Dependency ${name} is using non-deterministic version "${v}".`,
            recommendation: 'Pin dependency to a fixed version or a constrained semver range.',
            evidence: `${name}@${v}`,
          });
        }
      }

      const scripts =
        typeof pkg.scripts === 'object' && pkg.scripts
          ? (pkg.scripts as Record<string, unknown>)
          : {};
      for (const [scriptName, scriptValue] of Object.entries(scripts)) {
        const content = String(scriptValue);
        if (/--inspect\b/.test(content) || /\bnode\s+--inspect/.test(content)) {
          findings.push({
            id: `APP-DEBUG-SCRIPT-${scriptName}`,
            title: 'Debug-enabled script found',
            severity: 'low',
            category: 'application',
            description: `Script "${scriptName}" contains debug flags.`,
            recommendation: 'Avoid exposing debug-enabled scripts in production workflows.',
            evidence: content,
          });
        }
      }
    } catch {
      findings.push({
        id: 'APP-PACKAGE-MISSING',
        title: 'package.json not readable',
        severity: 'low',
        category: 'application',
        description: 'Could not read package.json for application-level checks.',
        recommendation:
          'Ensure application metadata is available before running vulnerability checks.',
      });
    }
    return findings;
  }
}
