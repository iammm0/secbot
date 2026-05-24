import { spawn } from 'node:child_process';
import { platform } from 'node:os';
import { BaseTool, ToolResult } from '../core/base-tool';

export class TracerouteTool extends BaseTool {
  constructor() {
    super('traceroute', '路由追踪 — 显示到目标的网络路径和每跳延迟');
  }

  async run(params: Record<string, unknown>): Promise<ToolResult> {
    const target = String(params.target ?? '').trim();
    if (!target) return { success: false, result: null, error: '缺少必要参数: target' };

    const maxHops = Math.min(Number(params.max_hops) || 30, 64);
    const timeoutSec = Math.min(Number(params.timeout) || 30, 120);

    const isWin = platform() === 'win32';
    const cmd = isWin ? 'tracert' : 'traceroute';
    const args = isWin
      ? ['-h', String(maxHops), '-w', '2000', target]
      : ['-m', String(maxHops), '-w', '2', '-q', '1', target];

    const result = await this.exec(cmd, args, timeoutSec);
    if (result.error) return { success: false, result: null, error: result.error };

    const hops = this.parse(result.stdout);

    return {
      success: true,
      result: { target, hops_count: hops.length, hops },
    };
  }

  private parse(output: string): Array<Record<string, unknown>> {
    const hops: Array<Record<string, unknown>> = [];
    for (const line of output.split('\n')) {
      const m = line.match(/^\s*(\d+)\s+(.+)/);
      if (!m) continue;
      const hop = Number(m[1]);
      const rest = m[2].trim();

      if (/\*\s*\*\s*\*/.test(rest)) {
        hops.push({ hop, host: '*', rtt: null });
        continue;
      }

      const hostMatch = rest.match(/([a-zA-Z0-9._-]+)\s+\(?([\d.]+)\)?/);
      const rttMatch = rest.match(/([\d.]+)\s*ms/);
      hops.push({
        hop,
        host: hostMatch?.[1] ?? rest.split(/\s/)[0],
        ip: hostMatch?.[2] ?? undefined,
        rtt_ms: rttMatch ? parseFloat(rttMatch[1]) : null,
      });
    }
    return hops;
  }

  private exec(cmd: string, args: string[], timeoutSec: number): Promise<{ stdout: string; error?: string }> {
    return new Promise((resolve) => {
      const child = spawn(cmd, args, { shell: false, windowsHide: true });
      let stdout = '';
      let done = false;

      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', (c) => { stdout += c; });

      const timer = setTimeout(() => {
        if (done) return;
        done = true;
        child.kill('SIGTERM');
        resolve({ stdout, error: `超时 (${timeoutSec}s)` });
      }, timeoutSec * 1000);

      child.on('error', (err) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve({ stdout, error: /ENOENT/.test(err.message) ? `${cmd} 未安装` : err.message });
      });

      child.on('close', () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve({ stdout });
      });
    });
  }
}
