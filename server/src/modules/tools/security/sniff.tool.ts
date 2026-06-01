import { spawn } from 'node:child_process';
import { BaseTool, ToolResult } from '../core/base-tool';

export class SniffTool extends BaseTool {
  constructor() {
    super('sniff', '抓包分析 — 调用 tshark 进行网络流量捕获与协议分析', true);
  }

  async run(params: Record<string, unknown>): Promise<ToolResult> {
    const iface = params.interface ? String(params.interface).trim() : undefined;
    const filter = params.filter ? String(params.filter).trim() : undefined;
    const count = Math.min(Number(params.count) || 50, 500);
    const duration = Math.min(Number(params.duration) || 10, 60);
    const fields = params.fields ? String(params.fields).trim() : undefined;

    const args = [
      '-c',
      String(count),
      '-a',
      `duration:${duration}`,
      '-T',
      'fields',
      '-e',
      'frame.number',
      '-e',
      'frame.time_relative',
      '-e',
      'ip.src',
      '-e',
      'ip.dst',
      '-e',
      'tcp.srcport',
      '-e',
      'tcp.dstport',
      '-e',
      '_ws.col.Protocol',
      '-e',
      '_ws.col.Info',
      '-E',
      'header=y',
      '-E',
      'separator=|',
    ];

    if (fields) {
      // Override default fields
      const idx = args.indexOf('-e');
      args.splice(idx, args.length - idx);
      for (const f of fields.split(',')) args.push('-e', f.trim());
      args.push('-E', 'header=y', '-E', 'separator=|');
    }

    if (iface) args.push('-i', iface);
    if (filter) args.push('-f', filter);

    const result = await this.exec(args, duration + 10);
    if (result.error) return { success: false, result: null, error: result.error };

    const packets = this.parse(result.stdout);

    return {
      success: true,
      result: {
        interface: iface ?? 'default',
        filter: filter ?? 'none',
        packets_captured: packets.length,
        duration_sec: duration,
        packets: packets.slice(0, 100),
      },
    };
  }

  private parse(output: string): Array<Record<string, string>> {
    const lines = output.split('\n').filter((l) => l.trim());
    if (lines.length < 2) return [];

    const headers = lines[0].split('|').map((h) => h.trim());
    const packets: Array<Record<string, string>> = [];

    for (let i = 1; i < lines.length; i++) {
      const vals = lines[i].split('|');
      const pkt: Record<string, string> = {};
      headers.forEach((h, idx) => {
        if (vals[idx]?.trim()) pkt[h] = vals[idx].trim();
      });
      packets.push(pkt);
    }
    return packets;
  }

  private exec(args: string[], timeoutSec: number): Promise<{ stdout: string; error?: string }> {
    return new Promise((resolve) => {
      const child = spawn('tshark', args, { shell: false, windowsHide: true });
      let stdout = '';
      let stderr = '';
      let done = false;

      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', (c) => {
        stdout += c;
      });
      child.stderr.on('data', (c) => {
        stderr += c;
      });

      const timer = setTimeout(() => {
        if (done) return;
        done = true;
        child.kill('SIGTERM');
        resolve({ stdout });
      }, timeoutSec * 1000);
      child.on('error', (err) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve({
          stdout,
          error: /ENOENT/.test(err.message)
            ? 'tshark 未安装，请安装 Wireshark: brew install wireshark'
            : err.message,
        });
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
