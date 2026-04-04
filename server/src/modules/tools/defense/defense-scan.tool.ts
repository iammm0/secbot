import { randomUUID } from 'node:crypto';
import { BaseTool, ToolResult } from '../core/base-tool';
import { IntrusionDetectTool } from './intrusion-detect.tool';
import { NetworkAnalyzeTool } from './network-analyze.tool';
import { SelfVulnScanTool } from './self-vuln-scan.tool';

type Dict = Record<string, unknown>;

export class DefenseScanTool extends BaseTool {
  constructor() {
    super(
      'defense_scan',
      'Run a full host defense scan combining self-vuln scan, network analysis, intrusion summary and recommendations.',
    );
  }

  async run(): Promise<ToolResult> {
    try {
      const vulnTool = new SelfVulnScanTool();
      const networkTool = new NetworkAnalyzeTool();
      const intrusionTool = new IntrusionDetectTool();

      const [vuln, network, intrusion] = await Promise.all([
        vulnTool.run({ scan_type: 'all' }),
        networkTool.run({ include_traffic: true }),
        intrusionTool.run({ hours: 24 }),
      ]);

      const vulnerabilities = this.extractVulnerabilitySummary(vuln);
      const networkSummary = this.extractNetworkSummary(network);
      const attacksDetected = this.extractAttackCount(intrusion);
      const recommendations = this.buildRecommendations(vulnerabilities, networkSummary, attacksDetected);

      return {
        success: true,
        result: {
          report_id: `defense-${randomUUID()}`,
          generated_at: new Date().toISOString(),
          summary: {
            vulnerability_total: vulnerabilities.total,
            suspicious_connections: networkSummary.suspicious_count,
            attacks_detected: attacksDetected,
          },
          vulnerabilities,
          network: networkSummary,
          attacks_detected: attacksDetected,
          recommendations,
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

  private extractVulnerabilitySummary(result: ToolResult): { total: number; by_severity: Dict } {
    const fallback = { total: 0, by_severity: {} };
    if (!result.success || !result.result || typeof result.result !== 'object') {
      return fallback;
    }
    const data = result.result as Dict;
    return {
      total: Number(data.total_vulnerabilities ?? 0),
      by_severity: (data.by_severity as Dict) ?? {},
    };
  }

  private extractNetworkSummary(result: ToolResult): { total_connections: number; suspicious_count: number } {
    if (!result.success || !result.result || typeof result.result !== 'object') {
      return { total_connections: 0, suspicious_count: 0 };
    }
    const data = result.result as Dict;
    return {
      total_connections: Number(data.total_connections ?? 0),
      suspicious_count: Number(data.suspicious_count ?? 0),
    };
  }

  private extractAttackCount(result: ToolResult): number {
    if (!result.success || !result.result || typeof result.result !== 'object') {
      return 0;
    }
    const data = result.result as Dict;
    return Number(data.recent_attack_count ?? 0);
  }

  private buildRecommendations(
    vulnerabilities: { total: number; by_severity: Dict },
    network: { total_connections: number; suspicious_count: number },
    attacksDetected: number,
  ): string[] {
    const recs: string[] = [];
    if (vulnerabilities.total > 0) {
      recs.push('Prioritize patching and remediation for detected vulnerabilities, starting with high/critical severities.');
    }
    if (network.suspicious_count > 0) {
      recs.push('Investigate suspicious outbound/inbound sessions and block unknown destinations at firewall level.');
    }
    if (attacksDetected > 0) {
      recs.push('Enable stronger intrusion monitoring and review attack indicators from recent events.');
    }
    if (recs.length === 0) {
      recs.push('No immediate high-risk indicators found; maintain baseline monitoring and routine patch management.');
    }
    return recs;
  }
}
