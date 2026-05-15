import { spawn } from 'node:child_process';
import { BaseTool, ToolResult } from '../core/base-tool';

type ScanType = 'tcp_syn' | 'tcp_connect' | 'udp' | 'ping' | 'version' | 'os' | 'aggressive';

const SCAN_FLAGS: Record<ScanType, string[]> = {
  tcp_syn: ['-sS'],
  tcp_connect: ['-sT'],
  udp: ['-sU'],
  ping: ['-sn'],
  version: ['-sV'],
  os: ['-O'],
  aggressive: ['-A'],
};

export class NmapScanTool extends BaseTool {
  constructor() {
    super(
      'nmap_scan',
      'Nmap 扫描 — 调用 nmap 执行端口扫描、服务版本检测、OS 识别、NSE 脚本扫描等',
    );
  }

  async run(params: Record<string, unknown>): Promise<ToolResult> {
    const target = String(params.target ?? '').trim();
    if (!target) {
      return { success: false, result: null, error: '缺少必要参数: target' };
    }

    const scanType = (String(params.scan_type ?? 'tcp_connect').trim()) as ScanType;
    const ports = params.ports ? String(params.ports).trim() : undefined;
    const scripts = params.scripts ? String(params.scripts).trim() : undefined;
    const timing = params.timing ? String(params.timing).trim() : 'T3';
    const extraArgs = Array.isArray(params.extra_args) ? params.extra_args.map(String) : [];
    const timeoutSec = Math.min(Number(params.timeout) || 120, 600);

    const args: string[] = ['-oX', '-', `-${timing}`];

    const flags = SCAN_FLAGS[scanType] ?? SCAN_FLAGS.tcp_connect;
    args.push(...flags);

    if (ports && scanType !== 'ping') {
      args.push('-p', ports);
    }
    if (scripts) {
      args.push('--script', scripts);
    }
    args.push(...extraArgs, target);

    const result = await this.exec(args, timeoutSec);
    if (result.error) {
      return { success: false, result: null, error: result.error };
    }

    const parsed = this.parseXml(result.stdout);
    return {
      success: true,
      result: {
        target,
        scan_type: scanType,
        command: `nmap ${args.join(' ')}`,
        ...parsed,
        raw_stderr: result.stderr || undefined,
      },
    };
  }

  private exec(
    args: string[],
    timeoutSec: number,
  ): Promise<{ code: number; stdout: string; stderr: string; error?: string }> {
    return new Promise((resolve) => {
      const child = spawn('nmap', args, { shell: false, windowsHide: true });
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
        resolve({ code: -1, stdout, stderr, error: `nmap 超时 (${timeoutSec}s)` });
      }, timeoutSec * 1000);

      child.on('error', (err) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        const msg = /ENOENT/.test(err.message)
          ? 'nmap 未安装，请先执行: brew install nmap'
          : err.message;
        resolve({ code: -1, stdout, stderr, error: msg });
      });

      child.on('close', (code) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        if (code !== 0 && !stdout.includes('<nmaprun')) {
          resolve({ code: code ?? -1, stdout, stderr, error: stderr.trim() || `nmap 退出码 ${code}` });
        } else {
          resolve({ code: code ?? 0, stdout, stderr });
        }
      });
    });
  }

  private parseXml(xml: string): Record<string, unknown> {
    const hosts: Array<Record<string, unknown>> = [];

    // Extract each <host>...</host> block
    const hostBlocks = xml.match(/<host\b[^>]*>[\s\S]*?<\/host>/g) ?? [];
    for (const block of hostBlocks) {
      const addr = this.attr(block, 'address', 'addr');
      const state = this.attr(block, 'status', 'state');

      const ports: Array<Record<string, unknown>> = [];
      const portMatches = block.match(/<port\b[^>]*>[\s\S]*?<\/port>/g) ?? [];
      for (const pm of portMatches) {
        const portId = this.attr(pm, 'port', 'portid');
        const protocol = this.attr(pm, 'port', 'protocol');
        const portState = this.attr(pm, 'state', 'state');
        const service = this.attr(pm, 'service', 'name');
        const product = this.attr(pm, 'service', 'product');
        const version = this.attr(pm, 'service', 'version');
        ports.push({
          port: Number(portId) || portId,
          protocol,
          state: portState,
          service,
          product: product || undefined,
          version: version || undefined,
        });
      }

      // OS detection
      const osMatch = block.match(/<osmatch\b[^>]*name="([^"]*)"[^>]*accuracy="([^"]*)"/);
      const os = osMatch ? { name: osMatch[1], accuracy: osMatch[2] } : undefined;

      // Scripts
      const scripts: Array<{ id: string; output: string }> = [];
      const scriptMatches = block.match(/<script\b[^>]*>[\s\S]*?<\/script>|<script\b[^/]*\/>/g) ?? [];
      for (const sm of scriptMatches) {
        const id = sm.match(/id="([^"]*)"/)?.[1] ?? '';
        const output = sm.match(/output="([^"]*)"/)?.[1] ?? '';
        if (id) scripts.push({ id, output });
      }

      hosts.push({
        address: addr,
        state,
        ports: ports.length ? ports : undefined,
        os,
        scripts: scripts.length ? scripts : undefined,
      });
    }

    // Scan info
    const startTime = xml.match(/startstr="([^"]*)"/)?.[1];
    const elapsed = xml.match(/elapsed="([^"]*)"/)?.[1];

    return { hosts, scan_time: startTime, elapsed_seconds: elapsed ? Number(elapsed) : undefined };
  }

  private attr(xml: string, tag: string, attr: string): string {
    const re = new RegExp(`<${tag}\\b[^>]*${attr}="([^"]*)"`, 'i');
    return xml.match(re)?.[1] ?? '';
  }
}
