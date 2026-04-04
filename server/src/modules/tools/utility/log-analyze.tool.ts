import { promises as fs } from 'node:fs';
import { BaseTool, ToolResult } from '../core/base-tool';

const SECURITY_PATTERNS: Record<string, RegExp> = {
  failed_login: /(failed|invalid|wrong).*(login|password|auth|credential)/i,
  brute_force: /(too many|rate limit|max.*attempt|repeated.*fail)/i,
  sql_injection: /(sql.*syntax|union.*select|drop.*table|or.*1\s*=\s*1)/i,
  xss_attempt: /(<script|javascript:|onerror\s*=|onload\s*=)/i,
  path_traversal: /(\.\.\/|\.\.\\|%2e%2e)/i,
  command_injection: /(;.*cat|;.*ls|;.*wget|;.*curl|\|.*sh|\$\()/i,
  error: /(error|exception|traceback|panic|fatal|critical)/i,
  warning: /(warning|warn|deprecated)/i,
  suspicious_ip: /\b\d{1,3}(?:\.\d{1,3}){3}\b/,
  sensitive_file: /(\/etc\/passwd|\/etc\/shadow|\.env|\.git|wp-config|\.htaccess)/i,
};

export class LogAnalyzeTool extends BaseTool {
  constructor() {
    super('log_analyze', 'Analyze logs and extract security-related events.');
  }

  async run(params: Record<string, unknown>): Promise<ToolResult> {
    const filePath = params.path as string | undefined;
    const inlineText = params.log_text as string | undefined;
    const linesLimit = Number(params.lines ?? 1000);
    const customPattern = params.pattern as string | undefined;

    try {
      let lines: string[] = [];
      if (inlineText) {
        lines = inlineText.split('\n');
      } else if (filePath) {
        const content = await fs.readFile(filePath, 'utf8');
        const all = content.split('\n');
        lines = all.slice(Math.max(0, all.length - linesLimit));
      } else {
        return { success: false, result: null, error: 'Provide path or log_text' };
      }

      const findings: Record<string, Array<{ line_no: number; content: string }>> = {};
      const ipCounter = new Map<string, number>();
      const severity = { HIGH: 0, MEDIUM: 0, LOW: 0 };
      const customRegex = customPattern ? new RegExp(customPattern, 'i') : null;

      lines.forEach((line, idx) => {
        const lineNo = idx + 1;
        if (!line.trim()) return;

        for (const [name, pattern] of Object.entries(SECURITY_PATTERNS)) {
          if (!pattern.test(line)) continue;
          (findings[name] ??= []).push({ line_no: lineNo, content: line.slice(0, 300) });

          if (name === 'suspicious_ip') {
            const ips = line.match(/\b\d{1,3}(?:\.\d{1,3}){3}\b/g) ?? [];
            for (const ip of ips) {
              ipCounter.set(ip, (ipCounter.get(ip) ?? 0) + 1);
            }
          }
          if (['sql_injection', 'xss_attempt', 'command_injection', 'path_traversal'].includes(name)) {
            severity.HIGH += 1;
          } else if (['failed_login', 'brute_force', 'sensitive_file'].includes(name)) {
            severity.MEDIUM += 1;
          } else if (name === 'error') {
            severity.LOW += 1;
          }
        }

        if (customRegex && customRegex.test(line)) {
          (findings.custom_match ??= []).push({ line_no: lineNo, content: line.slice(0, 300) });
        }
      });

      for (const key of Object.keys(findings)) {
        findings[key] = findings[key].slice(0, 50);
      }

      const topIps = [...ipCounter.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20)
        .map(([ip, count]) => ({ ip, count }));

      const totalEvents = Object.values(findings).reduce((sum, arr) => sum + arr.length, 0);
      const riskLevel =
        severity.HIGH > 10
          ? 'CRITICAL'
          : severity.HIGH > 0
            ? 'HIGH'
            : severity.MEDIUM > 5
              ? 'MEDIUM'
              : severity.MEDIUM > 0
                ? 'LOW'
                : 'NONE';

      return {
        success: true,
        result: {
          source: filePath ?? '(inline text)',
          total_lines_analyzed: lines.length,
          summary: {
            security_events: Object.fromEntries(
              Object.entries(findings).map(([k, v]) => [k, v.length]),
            ),
            severity_distribution: severity,
            top_ips: topIps,
            total_security_events: totalEvents,
            risk_level: riskLevel,
          },
          findings,
        },
      };
    } catch (error) {
      return { success: false, result: null, error: (error as Error).message };
    }
  }
}

