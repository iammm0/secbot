import { promises as fs } from 'node:fs';
import path from 'node:path';
import { BaseTool, ToolResult } from '../core/base-tool';

type RiskLevel = 'critical' | 'high' | 'medium' | 'low' | 'info';

type Finding = {
  title: string;
  risk: RiskLevel;
  description: string;
  recommendation: string;
  affected?: string;
  vuln_id?: string;
  cvss_score?: number;
};

const RISK_ORDER: Record<RiskLevel, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
  info: 4,
};

const RISK_TAG: Record<RiskLevel, string> = {
  critical: '[CRITICAL]',
  high: '[HIGH]',
  medium: '[MEDIUM]',
  low: '[LOW]',
  info: '[INFO]',
};

export class ReportGeneratorTool extends BaseTool {
  constructor() {
    super('report_generator', 'Generate structured security reports in markdown/html/json/pentest format.');
  }

  async run(params: Record<string, unknown>): Promise<ToolResult> {
    const title = String(params.title ?? 'Security Assessment Report').trim() || 'Security Assessment Report';
    const format = String(params.format ?? 'markdown').trim().toLowerCase();
    const target = String(params.target ?? '').trim();
    const attackChain = params.attack_chain;
    const exploitResults = params.exploit_results;
    const findings = this.normalizeFindings(params.findings);

    if (!['markdown', 'html', 'json', 'pentest'].includes(format)) {
      return { success: false, result: null, error: 'format must be markdown/html/json/pentest' };
    }

    const stats = this.buildStats(findings);
    const timestamp = new Date().toISOString().replace('T', ' ').slice(0, 19);

    let content = '';
    let ext = 'md';
    if (format === 'markdown') {
      content = this.generateMarkdown(title, target, timestamp, findings, stats);
      ext = 'md';
    } else if (format === 'html') {
      content = this.generateHtml(title, target, timestamp, findings, stats);
      ext = 'html';
    } else if (format === 'pentest') {
      content = this.generatePentestMarkdown(
        title,
        target,
        timestamp,
        findings,
        stats,
        attackChain,
        exploitResults,
      );
      ext = 'md';
    } else {
      content = JSON.stringify(
        {
          title,
          target,
          timestamp,
          statistics: stats,
          findings,
          attack_chain: attackChain ?? null,
          exploit_results: exploitResults ?? null,
        },
        null,
        2,
      );
      ext = 'json';
    }

    const reportsDir = path.resolve(process.cwd(), 'reports');
    await fs.mkdir(reportsDir, { recursive: true });
    const safeTitle = title.replace(/[^a-zA-Z0-9\-_ ]/g, '').slice(0, 50).trim() || 'report';
    const suffix = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, '').replace('T', '_');
    const filePath = path.join(reportsDir, `${safeTitle}_${suffix}.${ext}`);
    await fs.writeFile(filePath, content, 'utf8');

    return {
      success: true,
      result: {
        file: filePath,
        format,
        statistics: stats,
        total_findings: findings.length,
        content_preview: content.slice(0, 500),
      },
    };
  }

  private normalizeFindings(input: unknown): Finding[] {
    const list = Array.isArray(input) ? input : input ? [input] : [];
    const normalized: Finding[] = [];

    for (const item of list) {
      if (typeof item === 'string') {
        normalized.push({
          title: item,
          risk: 'info',
          description: item,
          recommendation: '',
        });
        continue;
      }
      if (typeof item !== 'object' || item === null) continue;

      const rec = item as Record<string, unknown>;
      const risk = String(rec.risk ?? 'info').toLowerCase();
      normalized.push({
        title: String(rec.title ?? 'Unnamed finding'),
        risk: this.normalizeRisk(risk),
        description: String(rec.description ?? ''),
        recommendation: String(rec.recommendation ?? ''),
        affected: rec.affected ? String(rec.affected) : undefined,
        vuln_id: rec.vuln_id ? String(rec.vuln_id) : undefined,
        cvss_score: typeof rec.cvss_score === 'number' ? rec.cvss_score : undefined,
      });
    }
    return normalized;
  }

  private normalizeRisk(risk: string): RiskLevel {
    if (risk === 'critical' || risk === 'high' || risk === 'medium' || risk === 'low') {
      return risk;
    }
    return 'info';
  }

  private buildStats(findings: Finding[]): Record<RiskLevel, number> {
    const stats: Record<RiskLevel, number> = {
      critical: 0,
      high: 0,
      medium: 0,
      low: 0,
      info: 0,
    };
    for (const finding of findings) {
      stats[finding.risk] += 1;
    }
    return stats;
  }

  private generateMarkdown(
    title: string,
    target: string,
    timestamp: string,
    findings: Finding[],
    stats: Record<RiskLevel, number>,
  ): string {
    const lines = [
      `# ${title}`,
      '',
      `**Generated At**: ${timestamp}  `,
      target ? `**Target**: ${target}  ` : '',
      '',
      '## Summary',
      '',
      '| Risk | Count |',
      '|------|------|',
      `| Critical | ${stats.critical} |`,
      `| High | ${stats.high} |`,
      `| Medium | ${stats.medium} |`,
      `| Low | ${stats.low} |`,
      `| Info | ${stats.info} |`,
      '',
      '## Findings',
      '',
    ].filter(Boolean);

    const sorted = [...findings].sort((a, b) => RISK_ORDER[a.risk] - RISK_ORDER[b.risk]);
    if (sorted.length === 0) {
      lines.push('*No significant security findings were reported.*', '');
      return lines.join('\n');
    }

    sorted.forEach((finding, index) => {
      lines.push(`### ${index + 1}. ${RISK_TAG[finding.risk]} ${finding.title}`);
      lines.push('');
      if (finding.description) lines.push(`**Description**: ${finding.description}`, '');
      if (finding.recommendation) lines.push(`**Recommendation**: ${finding.recommendation}`, '');
      lines.push('---', '');
    });

    return lines.join('\n');
  }

  private generateHtml(
    title: string,
    target: string,
    timestamp: string,
    findings: Finding[],
    stats: Record<RiskLevel, number>,
  ): string {
    const riskColors: Record<RiskLevel, string> = {
      critical: '#b91c1c',
      high: '#ea580c',
      medium: '#ca8a04',
      low: '#15803d',
      info: '#0f766e',
    };

    const sorted = [...findings].sort((a, b) => RISK_ORDER[a.risk] - RISK_ORDER[b.risk]);
    const findingsHtml =
      sorted.length === 0
        ? '<p><em>No significant security findings were reported.</em></p>'
        : sorted
            .map((finding, index) => {
              const color = riskColors[finding.risk];
              return `
<div style="border-left:4px solid ${color};padding:12px;margin:12px 0;background:#f8fafc;">
  <h3>${index + 1}. <span style="color:${color}">${RISK_TAG[finding.risk]}</span> ${this.escapeHtml(
    finding.title,
  )}</h3>
  <p><strong>Description:</strong> ${this.escapeHtml(finding.description)}</p>
  ${
    finding.recommendation
      ? `<p><strong>Recommendation:</strong> ${this.escapeHtml(finding.recommendation)}</p>`
      : ''
  }
</div>`
            })
            .join('\n');

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>${this.escapeHtml(title)}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; max-width: 960px; margin: 32px auto; padding: 0 20px; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border: 1px solid #d1d5db; padding: 8px; text-align: center; }
    th { background: #f3f4f6; }
  </style>
</head>
<body>
  <h1>${this.escapeHtml(title)}</h1>
  <p><strong>Generated At:</strong> ${this.escapeHtml(timestamp)}</p>
  ${target ? `<p><strong>Target:</strong> ${this.escapeHtml(target)}</p>` : ''}
  <h2>Summary</h2>
  <table>
    <tr><th>Risk</th><th>Count</th></tr>
    <tr><td>Critical</td><td>${stats.critical}</td></tr>
    <tr><td>High</td><td>${stats.high}</td></tr>
    <tr><td>Medium</td><td>${stats.medium}</td></tr>
    <tr><td>Low</td><td>${stats.low}</td></tr>
    <tr><td>Info</td><td>${stats.info}</td></tr>
  </table>
  <h2>Findings</h2>
  ${findingsHtml}
</body>
</html>`;
  }

  private generatePentestMarkdown(
    title: string,
    target: string,
    timestamp: string,
    findings: Finding[],
    stats: Record<RiskLevel, number>,
    attackChain: unknown,
    exploitResults: unknown,
  ): string {
    const lines = [
      `# ${title}`,
      '',
      `**Generated At**: ${timestamp}  `,
      target ? `**Target**: ${target}  ` : '',
      '**Report Type**: Penetration Test',
      '',
      '---',
      '',
      '## 1. Summary Statistics',
      '',
      '| Risk | Count |',
      '|------|------|',
      `| Critical | ${stats.critical} |`,
      `| High | ${stats.high} |`,
      `| Medium | ${stats.medium} |`,
      `| Low | ${stats.low} |`,
      `| Info | ${stats.info} |`,
      '',
      '## 2. Vulnerability Details',
      '',
    ];

    const sorted = [...findings].sort((a, b) => RISK_ORDER[a.risk] - RISK_ORDER[b.risk]);
    if (sorted.length === 0) {
      lines.push('*No significant security findings were reported.*', '');
    } else {
      sorted.forEach((finding, idx) => {
        lines.push(`### 2.${idx + 1} ${RISK_TAG[finding.risk]} ${finding.title}`, '');
        if (finding.vuln_id) lines.push(`- **Vulnerability ID**: ${finding.vuln_id}`);
        if (typeof finding.cvss_score === 'number') lines.push(`- **CVSS**: ${finding.cvss_score}`);
        if (finding.description) lines.push(`- **Description**: ${finding.description}`);
        if (finding.affected) lines.push(`- **Impact**: ${finding.affected}`);
        if (finding.recommendation) lines.push(`- **Recommendation**: ${finding.recommendation}`);
        lines.push('', '---', '');
      });
    }

    lines.push('## 3. Attack Chain Analysis', '');
    lines.push(...this.renderAttackChain(attackChain), '');
    lines.push('## 4. Exploitation Results', '');
    lines.push(...this.renderExploitResults(exploitResults), '');
    lines.push('## 5. Overall Risk Assessment', '');
    lines.push(...this.renderRiskAssessment(stats), '');
    lines.push('## 6. Remediation Plan', '');
    lines.push(...this.renderRemediation(findings), '');
    return lines.join('\n');
  }

  private renderAttackChain(attackChain: unknown): string[] {
    if (!attackChain || typeof attackChain !== 'object') {
      return ['*No attack chain data available.*'];
    }
    const chain = attackChain as Record<string, unknown>;
    const lines: string[] = [];
    lines.push(`**Status**: ${chain.success ? 'Successful' : 'Unsuccessful'}  `);
    lines.push(`**Final Permission**: ${String(chain.final_permission ?? 'N/A')}  `);
    if (chain.summary) lines.push(`**Summary**: ${String(chain.summary)}  `);
    lines.push('');

    const steps = Array.isArray(chain.steps) ? (chain.steps as Record<string, unknown>[]) : [];
    if (steps.length > 0) {
      lines.push('### Attack Path', '');
      lines.push('| Step | Target | Vulnerability | Tool | Status | Permission |');
      lines.push('|------|--------|---------------|------|--------|------------|');
      for (const step of steps) {
        lines.push(
          `| ${String(step.step_id ?? '')} | ${String(step.target ?? '')} | ${String(step.vuln_id ?? '')} | ${String(
            step.exploit_tool ?? '',
          )} | ${String(step.status ?? '')} | ${String(step.permission_gained ?? '')} |`,
        );
      }
      lines.push('');
    }

    const rollbacks = Array.isArray(chain.rollbacks) ? (chain.rollbacks as Record<string, unknown>[]) : [];
    if (rollbacks.length > 0) {
      lines.push(`### Rollbacks (${rollbacks.length})`, '');
      for (const rollback of rollbacks) {
        lines.push(`- Vulnerability ${String(rollback.vuln_id ?? '')}: ${String(rollback.error ?? '')}`);
      }
    }
    return lines;
  }

  private renderExploitResults(input: unknown): string[] {
    if (!input) return ['*No exploit execution results were provided.*'];
    const list = Array.isArray(input) ? input : [input];
    const lines: string[] = [];
    let index = 0;
    for (const item of list) {
      if (typeof item !== 'object' || item === null) continue;
      index += 1;
      const rec = item as Record<string, unknown>;
      lines.push(`### 4.${index} ${String(rec.exploit_type ?? 'exploit')}`);
      lines.push(`- **Target**: ${String(rec.target ?? '')}`);
      lines.push(`- **Success**: ${rec.success ? 'Yes' : 'No'}`);
      if (typeof rec.vulnerable === 'boolean') {
        lines.push(`- **Vulnerable**: ${rec.vulnerable ? 'Yes' : 'No'}`);
      }
      if (typeof rec.duration === 'number') {
        lines.push(`- **Duration**: ${rec.duration.toFixed(2)}s`);
      }
      lines.push('');
    }
    if (index === 0) {
      return ['*No exploit execution results were provided.*'];
    }
    return lines;
  }

  private renderRiskAssessment(stats: Record<RiskLevel, number>): string[] {
    const highRisk = stats.critical + stats.high;
    const total = stats.critical + stats.high + stats.medium + stats.low + stats.info;
    if (highRisk > 0) {
      return [
        '**Risk Level**: High',
        `Detected ${highRisk} high-or-critical findings. Immediate remediation is required.`,
      ];
    }
    if (stats.medium > 0) {
      return ['**Risk Level**: Medium', `Detected ${stats.medium} medium findings. Prioritize fixes soon.`];
    }
    if (total > 0) {
      return ['**Risk Level**: Low', 'Only low/info findings were detected.'];
    }
    return ['**Risk Level**: Secure', 'No findings were reported.'];
  }

  private renderRemediation(findings: Finding[]): string[] {
    const recs = findings.filter((finding) => finding.recommendation);
    if (recs.length === 0) return ['*No remediation actions were provided.*'];
    return recs.map((finding, i) => `${i + 1}. **${finding.title}**: ${finding.recommendation}`);
  }

  private escapeHtml(text: string): string {
    return text
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }
}
