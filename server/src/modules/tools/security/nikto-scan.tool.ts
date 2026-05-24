import { spawn } from 'node:child_process';
import { BaseTool, ToolResult } from '../core/base-tool';

export class NiktoScanTool extends BaseTool {
  constructor() {
    super('nikto_scan', 'Nikto Web 漏扫 — 调用 nikto 对 Web 服务器执行综合漏洞扫描');
  }

  async run(params: Record<string, unknown>): Promise<ToolResult> {
    const target = String(params.target ?? '').trim();
    if (!target) {
      return { success: false, result: null, error: '缺少必要参数: target (URL or host:port)' };
    }

    const tuning = params.tuning ? String(params.tuning).trim() : undefined;
    const plugins = params.plugins ? String(params.plugins).trim() : undefined;
    const timeoutSec = Math.min(Number(params.timeout) || 180, 600);
    const extraArgs = Array.isArray(params.extra_args) ? params.extra_args.map(String) : [];

    const args = ['-h', target, '-Format', 'json', '-output', '/dev/stdout', '-nointeractive'];

    if (tuning) args.push('-Tuning', tuning);
    if (plugins) args.push('-Plugins', plugins);
    args.push(...extraArgs);

    const result = await this.exec(args, timeoutSec);
    if (result.error) {
      return { success: false, result: null, error: result.error };
    }

    const findings = this.parseOutput(result.stdout);

    return {
      success: true,
      result: {
        target,
        command: `nikto ${args.join(' ')}`,
        findings_count: findings.length,
        findings,
        raw_stderr: result.stderr?.slice(0, 1000) || undefined,
      },
    };
  }

  private parseOutput(output: string): Array<Record<string, unknown>> {
    // nikto JSON output is an object with vulnerabilities array
    try {
      const data = JSON.parse(output);
      const vulns = data?.vulnerabilities ?? data?.host?.[0]?.items ?? [];
      return (vulns as Array<Record<string, unknown>>).map((v) => ({
        id: v.id ?? v.osvdbid ?? v.OSVDB,
        method: v.method,
        url: v.url ?? v.uri,
        description: v.msg ?? v.description,
        references: v.references ?? undefined,
      }));
    } catch {
      // fallback: try JSON-lines
      const findings: Array<Record<string, unknown>> = [];
      for (const line of output.split('\n')) {
        if (!line.trim()) continue;
        try {
          const obj = JSON.parse(line);
          if (obj.vulnerabilities) {
            for (const v of obj.vulnerabilities) {
              findings.push({
                id: v.id ?? v.OSVDB,
                method: v.method,
                url: v.url,
                description: v.msg,
              });
            }
          }
        } catch { /* skip */ }
      }
      if (findings.length) return findings;

      // last resort: extract from text output
      const lines = output.split('\n').filter((l) => l.includes('+ '));
      return lines.slice(0, 50).map((l) => ({ description: l.replace(/^\+\s*/, '').trim() }));
    }
  }

  private exec(
    args: string[],
    timeoutSec: number,
  ): Promise<{ code: number; stdout: string; stderr: string; error?: string }> {
    return new Promise((resolve) => {
      const child = spawn('nikto', args, { shell: false, windowsHide: true });
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
        resolve({ code: -1, stdout, stderr, error: `nikto 超时 (${timeoutSec}s)` });
      }, timeoutSec * 1000);

      child.on('error', (err) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        const msg = /ENOENT/.test(err.message)
          ? 'nikto 未安装，请执行: brew install nikto 或参考 https://github.com/sullo/nikto'
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
