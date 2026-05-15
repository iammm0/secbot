import { spawn } from 'node:child_process';
import { BaseTool, ToolResult } from '../core/base-tool';

export class NucleiScanTool extends BaseTool {
  constructor() {
    super('nuclei_scan', 'Nuclei 模板扫描 — 使用 nuclei 引擎对目标执行漏洞模板检测');
  }

  async run(params: Record<string, unknown>): Promise<ToolResult> {
    const target = String(params.target ?? '').trim();
    if (!target) {
      return { success: false, result: null, error: '缺少必要参数: target' };
    }

    const templates = params.templates ? String(params.templates).trim() : undefined;
    const severity = params.severity ? String(params.severity).trim() : undefined;
    const tags = params.tags ? String(params.tags).trim() : undefined;
    const timeoutSec = Math.min(Number(params.timeout) || 180, 600);
    const extraArgs = Array.isArray(params.extra_args) ? params.extra_args.map(String) : [];

    const args = ['-target', target, '-jsonl', '-silent', '-no-color'];

    if (templates) args.push('-t', templates);
    if (severity) args.push('-severity', severity);
    if (tags) args.push('-tags', tags);
    args.push(...extraArgs);

    const result = await this.exec(args, timeoutSec);
    if (result.error) {
      return { success: false, result: null, error: result.error };
    }

    const findings = this.parseJsonLines(result.stdout);

    return {
      success: true,
      result: {
        target,
        command: `nuclei ${args.join(' ')}`,
        findings_count: findings.length,
        findings,
        raw_stderr: result.stderr?.slice(0, 1000) || undefined,
      },
    };
  }

  private parseJsonLines(output: string): Array<Record<string, unknown>> {
    const findings: Array<Record<string, unknown>> = [];
    for (const line of output.split('\n')) {
      if (!line.trim()) continue;
      try {
        const obj = JSON.parse(line);
        findings.push({
          template_id: obj['template-id'] ?? obj.templateID,
          name: obj.info?.name ?? obj.name,
          severity: obj.info?.severity ?? obj.severity,
          type: obj.type,
          host: obj.host,
          matched_at: obj['matched-at'] ?? obj.matchedAt,
          extracted_results: obj['extracted-results'] ?? undefined,
          curl_command: obj['curl-command'] ?? undefined,
          description: obj.info?.description?.slice(0, 300) ?? undefined,
          tags: obj.info?.tags ?? undefined,
          reference: obj.info?.reference?.slice(0, 5) ?? undefined,
          matcher_name: obj['matcher-name'] ?? undefined,
        });
      } catch {
        // skip non-JSON lines
      }
    }
    return findings;
  }

  private exec(
    args: string[],
    timeoutSec: number,
  ): Promise<{ code: number; stdout: string; stderr: string; error?: string }> {
    return new Promise((resolve) => {
      const child = spawn('nuclei', args, { shell: false, windowsHide: true });
      let stdout = '';
      let stderr = '';
      let done = false;

      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', (c) => { stdout += c; });
      child.stderr.on('data', (c) => { stderr += c; });

      const timer = setTimeout(() => {
        if (done) return;
        done = true;
        child.kill('SIGTERM');
        resolve({ code: -1, stdout, stderr, error: `nuclei 超时 (${timeoutSec}s)` });
      }, timeoutSec * 1000);

      child.on('error', (err) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        const msg = /ENOENT/.test(err.message)
          ? 'nuclei 未安装，请参考: https://github.com/projectdiscovery/nuclei#install'
          : err.message;
        resolve({ code: -1, stdout, stderr, error: msg });
      });

      child.on('close', (code) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve({ code: code ?? 0, stdout, stderr });
      });
    });
  }
}
