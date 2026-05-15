import { spawn } from 'node:child_process';
import { BaseTool, ToolResult } from '../core/base-tool';

export class FfufScanTool extends BaseTool {
  constructor() {
    super('ffuf_scan', 'Ffuf 目录/参数爆破 — 调用 ffuf 执行高性能模糊测试');
  }

  async run(params: Record<string, unknown>): Promise<ToolResult> {
    const url = String(params.url ?? '').trim();
    if (!url) return { success: false, result: null, error: '缺少必要参数: url (含 FUZZ 占位符)' };

    const wordlist = params.wordlist ? String(params.wordlist).trim() : undefined;
    const filterStatus = params.filter_status ? String(params.filter_status).trim() : undefined;
    const filterSize = params.filter_size ? String(params.filter_size).trim() : undefined;
    const matchStatus = params.match_status ? String(params.match_status).trim() : '200,204,301,302,307,401,403';
    const threads = Math.min(Number(params.threads) || 40, 200);
    const recursion = params.recursion === true;
    const recursionDepth = Math.min(Number(params.recursion_depth) || 2, 5);
    const timeoutSec = Math.min(Number(params.timeout) || 120, 600);
    const extraArgs = Array.isArray(params.extra_args) ? params.extra_args.map(String) : [];

    const args = ['-u', url, '-t', String(threads), '-json', '-noninteractive', '-s'];

    if (wordlist) {
      args.push('-w', wordlist);
    } else {
      args.push('-w', '/usr/share/wordlists/dirb/common.txt');
    }

    if (matchStatus) args.push('-mc', matchStatus);
    if (filterStatus) args.push('-fc', filterStatus);
    if (filterSize) args.push('-fs', filterSize);
    if (recursion) {
      args.push('-recursion', '-recursion-depth', String(recursionDepth));
    }
    args.push(...extraArgs);

    const result = await this.exec(args, timeoutSec);
    if (result.error) {
      return { success: false, result: null, error: result.error };
    }

    const findings = this.parseJsonLines(result.stdout);

    return {
      success: true,
      result: {
        url,
        command: `ffuf ${args.join(' ')}`,
        findings_count: findings.length,
        findings,
      },
    };
  }

  private parseJsonLines(output: string): Array<Record<string, unknown>> {
    const findings: Array<Record<string, unknown>> = [];
    for (const line of output.split('\n')) {
      if (!line.trim()) continue;
      try {
        const obj = JSON.parse(line);
        if (obj.input || obj.status) {
          findings.push({
            input: obj.input?.FUZZ ?? obj.input,
            url: obj.url,
            status: obj.status,
            length: obj.length,
            words: obj.words,
            lines: obj.lines,
            content_type: obj['content-type'] ?? undefined,
            redirect_location: obj.redirectlocation ?? undefined,
          });
        }
      } catch { /* skip */ }
    }
    return findings;
  }

  private exec(
    args: string[],
    timeoutSec: number,
  ): Promise<{ code: number; stdout: string; stderr: string; error?: string }> {
    return new Promise((resolve) => {
      const child = spawn('ffuf', args, { shell: false, windowsHide: true });
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
        resolve({ code: -1, stdout, stderr, error: `ffuf 超时 (${timeoutSec}s)` });
      }, timeoutSec * 1000);

      child.on('error', (err) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        const msg = /ENOENT/.test(err.message)
          ? 'ffuf 未安装，请参考: https://github.com/ffuf/ffuf#installation'
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
