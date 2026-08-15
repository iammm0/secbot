import { spawn } from 'node:child_process';
import { BaseTool, ToolProgress, ToolProgressCallback, ToolResult } from '../core/base-tool';

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
    super('nmap_scan', 'Nmap 扫描 — 调用 nmap 执行端口扫描、服务版本检测、OS 识别、NSE 脚本扫描等');
  }

  async run(
    params: Record<string, unknown>,
    onProgress?: ToolProgressCallback,
  ): Promise<ToolResult> {
    const target = String(params.target ?? '').trim();
    if (!target) {
      return { success: false, result: null, error: '缺少必要参数: target' };
    }

    const scanType = String(params.scan_type ?? 'tcp_connect').trim() as ScanType;
    const ports = params.ports ? String(params.ports).trim() : undefined;
    const scripts = params.scripts ? String(params.scripts).trim() : undefined;
    const timing = params.timing ? String(params.timing).trim() : 'T4';
    const extraArgs = Array.isArray(params.extra_args) ? params.extra_args.map(String) : [];
    const timeoutSec = Math.min(Number(params.timeout) || 120, 600);

    const args: string[] = ['-oX', '-', `-${timing}`];
    const defaultsApplied: string[] = params.timing ? [] : ['timing=T4'];

    const flags = SCAN_FLAGS[scanType] ?? SCAN_FLAGS.tcp_connect;
    args.push(...flags);

    if (ports && scanType !== 'ping') {
      args.push('-p', ports);
    }
    if (scripts) {
      args.push('--script', scripts);
    }

    if (!this.hasStatsEvery(extraArgs)) {
      args.push('--stats-every', '10s');
      defaultsApplied.push('--stats-every=10s');
    }
    if (!this.hasDnsBehaviorArg(extraArgs)) {
      args.push('-n');
      defaultsApplied.push('-n');
    }

    args.push(...extraArgs, target);

    const command = `nmap ${args.join(' ')}`;
    const result = await this.exec(args, timeoutSec, command, onProgress);
    if (result.error) {
      return {
        success: false,
        result: {
          target,
          scan_type: scanType,
          command,
          scan_defaults_applied: defaultsApplied,
          progress_summary: result.progressSummary,
          raw_stderr: result.stderr || undefined,
        },
        error: result.error,
      };
    }

    const parsed = this.parseXml(result.stdout);
    return {
      success: true,
      result: {
        target,
        scan_type: scanType,
        command,
        scan_defaults_applied: defaultsApplied,
        progress_summary: result.progressSummary,
        ...parsed,
        raw_stderr: result.stderr || undefined,
      },
    };
  }

  private exec(
    args: string[],
    timeoutSec: number,
    command: string,
    onProgress?: ToolProgressCallback,
  ): Promise<{
    code: number;
    stdout: string;
    stderr: string;
    error?: string;
    progressSummary: Record<string, unknown>;
  }> {
    return new Promise((resolve) => {
      const child = spawn('nmap', args, { shell: false, windowsHide: true });
      let stdout = '';
      let stderr = '';
      let done = false;
      let lastOutputAt = Date.now();
      let lastProgress: ToolProgress | null = null;
      const startedAt = Date.now();

      const emitProgress = (progress: ToolProgress) => {
        const snapshot: ToolProgress = {
          tool: 'nmap_scan',
          command,
          elapsed_ms: Date.now() - startedAt,
          last_output_age_ms: Date.now() - lastOutputAt,
          ...progress,
        };
        lastProgress = snapshot;
        onProgress?.(snapshot);
      };

      emitProgress({
        status: 'running',
        phase: 'starting',
        message: 'nmap started; waiting for scan statistics',
        hint: 'Secbot will report nmap stats every ~10 seconds when nmap emits them.',
      });

      const progressTimer = setInterval(() => {
        if (done) return;
        const outputAge = Date.now() - lastOutputAt;
        if (outputAge > 120_000) {
          emitProgress({
            status: 'possibly_stuck',
            phase: lastProgress?.phase ?? 'waiting',
            progress: lastProgress?.progress,
            message: 'no nmap output for over 2 minutes',
            hint:
              'Process is still alive, but the scan may be blocked on network timeouts. Consider narrower ports, -Pn only when needed, or a lower timeout.',
          });
        } else if (outputAge > 30_000) {
          emitProgress({
            status: 'quiet',
            phase: lastProgress?.phase ?? 'waiting',
            progress: lastProgress?.progress,
            message: 'nmap is quiet but still running',
            hint: 'Quiet periods are common during filtered ports, UDP scans, DNS, and host discovery.',
          });
        } else {
          emitProgress({
            status: 'running',
            phase: lastProgress?.phase ?? 'running',
            progress: lastProgress?.progress,
            message: 'nmap process is alive',
          });
        }
      }, 10_000);

      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', (c) => {
        stdout += c;
        lastOutputAt = Date.now();
      });
      child.stderr.on('data', (c) => {
        stderr += c;
        lastOutputAt = Date.now();
        const parsed = this.parseProgressChunk(String(c));
        if (parsed) {
          emitProgress(parsed);
        }
      });

      const timer = setTimeout(() => {
        if (done) return;
        done = true;
        clearInterval(progressTimer);
        child.kill('SIGTERM');
        emitProgress({
          status: 'timed_out',
          phase: lastProgress?.phase ?? 'timeout',
          progress: lastProgress?.progress,
          message: `nmap timed out after ${timeoutSec}s`,
          hint: 'Try narrowing the target/ports, using faster timing, or increasing timeout deliberately.',
        });
        resolve({
          code: -1,
          stdout,
          stderr,
          error: `nmap 超时 (${timeoutSec}s)`,
          progressSummary: this.buildProgressSummary(startedAt, lastOutputAt, lastProgress),
        });
      }, timeoutSec * 1000);

      child.on('error', (err) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        clearInterval(progressTimer);
        const msg = /ENOENT/.test(err.message)
          ? 'nmap 未安装，请先执行: brew install nmap'
          : err.message;
        emitProgress({
          status: 'failed',
          phase: 'spawn',
          message: msg,
        });
        resolve({
          code: -1,
          stdout,
          stderr,
          error: msg,
          progressSummary: this.buildProgressSummary(startedAt, lastOutputAt, lastProgress),
        });
      });

      child.on('close', (code) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        clearInterval(progressTimer);
        if (code !== 0 && !stdout.includes('<nmaprun')) {
          emitProgress({
            status: 'failed',
            phase: lastProgress?.phase ?? 'finished',
            progress: lastProgress?.progress,
            message: stderr.trim() || `nmap exited with code ${code}`,
          });
          resolve({
            code: code ?? -1,
            stdout,
            stderr,
            error: stderr.trim() || `nmap 退出码 ${code}`,
            progressSummary: this.buildProgressSummary(startedAt, lastOutputAt, lastProgress),
          });
        } else {
          emitProgress({
            status: 'done',
            phase: 'finished',
            progress: 100,
            message: 'nmap scan completed',
          });
          resolve({
            code: code ?? 0,
            stdout,
            stderr,
            progressSummary: this.buildProgressSummary(startedAt, lastOutputAt, lastProgress),
          });
        }
      });
    });
  }

  private hasStatsEvery(args: string[]): boolean {
    return args.some((arg) => arg === '--stats-every' || arg.startsWith('--stats-every='));
  }

  private hasDnsBehaviorArg(args: string[]): boolean {
    return args.some((arg) => ['-n', '-R', '--dns-servers', '--system-dns'].includes(arg));
  }

  private parseProgressChunk(chunk: string): ToolProgress | null {
    const clean = chunk.replace(/\s+/g, ' ').trim();
    if (!clean) return null;

    const timing = clean.match(/([A-Za-z][^:;]*?) Timing:\s+About\s+([\d.]+)% done/i);
    const stats = clean.match(/Stats:\s+([^;]+elapsed);.*?undergoing\s+([^;]+)/i);
    const progress = timing ? Math.min(100, Math.max(0, Number(timing[2]))) : undefined;
    const phase = timing?.[1]?.trim() || stats?.[2]?.trim() || undefined;

    if (timing || stats) {
      return {
        status: 'running',
        phase,
        progress,
        message: progress !== undefined ? `${phase ?? 'scan'} ${progress.toFixed(1)}% done` : clean,
        hint: 'nmap is still reporting progress.',
        raw: clean.slice(0, 500),
      };
    }

    if (/Nmap scan report for|Initiating|Completed|Discovered open port/i.test(clean)) {
      return {
        status: 'running',
        phase: 'scan output',
        message: clean.slice(0, 180),
        raw: clean.slice(0, 500),
      };
    }

    return null;
  }

  private buildProgressSummary(
    startedAt: number,
    lastOutputAt: number,
    lastProgress: ToolProgress | null,
  ): Record<string, unknown> {
    return {
      status: lastProgress?.status ?? 'unknown',
      phase: lastProgress?.phase,
      progress: lastProgress?.progress,
      elapsed_ms: Date.now() - startedAt,
      last_output_age_ms: Date.now() - lastOutputAt,
    };
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
      const scriptMatches =
        block.match(/<script\b[^>]*>[\s\S]*?<\/script>|<script\b[^/]*\/>/g) ?? [];
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
