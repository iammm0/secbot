import { spawn } from 'node:child_process';
import os from 'node:os';
import { BaseTool, ToolResult } from '../core/base-tool';

type ConnectionRecord = {
  protocol: string;
  local: string;
  remote: string;
  status: string;
  pid?: string;
  raw: string;
};

function runCommand(command: string, args: string[], timeoutSec = 8): Promise<string> {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      shell: false,
      windowsHide: true,
      env: process.env,
    });
    let stdout = '';
    let stderr = '';
    let done = false;

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });

    const timer = setTimeout(
      () => {
        if (done) return;
        done = true;
        child.kill('SIGTERM');
        resolve(stdout || stderr);
      },
      Math.max(1, timeoutSec) * 1000,
    );

    child.on('error', () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve('');
    });
    child.on('close', () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(stdout || stderr);
    });
  });
}

function parseWindowsNetstat(output: string): ConnectionRecord[] {
  const result: ConnectionRecord[] = [];
  for (const line of output.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || (!trimmed.startsWith('TCP') && !trimmed.startsWith('UDP'))) continue;
    const parts = trimmed.split(/\s+/);
    if (parts.length < 4) continue;
    if (parts[0].startsWith('TCP') && parts.length >= 5) {
      result.push({
        protocol: parts[0],
        local: parts[1],
        remote: parts[2],
        status: parts[3],
        pid: parts[4],
        raw: trimmed,
      });
    } else if (parts[0].startsWith('UDP')) {
      result.push({
        protocol: parts[0],
        local: parts[1] ?? '',
        remote: parts[2] ?? '',
        status: 'UDP',
        pid: parts[parts.length - 1],
        raw: trimmed,
      });
    }
  }
  return result;
}

function parseUnixNetstat(output: string): ConnectionRecord[] {
  const result: ConnectionRecord[] = [];
  for (const line of output.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || !/^(tcp|udp)/i.test(trimmed)) continue;
    const parts = trimmed.split(/\s+/);
    if (parts.length < 5) continue;
    const protocol = parts[0];
    const local = parts[3] ?? '';
    const remote = parts[4] ?? '';
    const status = parts[5] ?? (protocol.toLowerCase().startsWith('udp') ? 'UDP' : 'UNKNOWN');
    result.push({
      protocol,
      local,
      remote,
      status,
      pid: parts[6],
      raw: trimmed,
    });
  }
  return result;
}

function extractHost(endpoint: string): string {
  if (!endpoint) return '';
  const cleaned = endpoint.replace(/^\[|\]$/g, '');
  const idx = cleaned.lastIndexOf(':');
  if (idx <= 0) return cleaned;
  return cleaned.slice(0, idx);
}

function isPrivateIp(host: string): boolean {
  if (!host) return false;
  if (host === 'localhost' || host === '127.0.0.1' || host === '::1') return true;
  if (/^10\./.test(host)) return true;
  if (/^192\.168\./.test(host)) return true;
  if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(host)) return true;
  return false;
}

export class NetworkAnalyzeTool extends BaseTool {
  constructor() {
    super(
      'network_analyze',
      'Analyze active local network connections and summarize suspicious activity.',
    );
  }

  async run(params: Record<string, unknown>): Promise<ToolResult> {
    const includeTraffic =
      params.include_traffic === undefined ? true : Boolean(params.include_traffic);
    try {
      const command = process.platform === 'win32' ? 'netstat' : 'netstat';
      const args = process.platform === 'win32' ? ['-ano'] : ['-an'];
      const output = await runCommand(command, args, 10);
      const records =
        process.platform === 'win32' ? parseWindowsNetstat(output) : parseUnixNetstat(output);

      const byStatus: Record<string, number> = {};
      const established: ConnectionRecord[] = [];
      const listening: ConnectionRecord[] = [];
      const suspicious: ConnectionRecord[] = [];

      for (const record of records) {
        const status = (record.status || 'UNKNOWN').toUpperCase();
        byStatus[status] = (byStatus[status] ?? 0) + 1;
        if (status.includes('ESTABLISHED')) {
          established.push(record);
        }
        if (status.includes('LISTEN')) {
          listening.push(record);
        }

        const remoteHost = extractHost(record.remote);
        const remotePort = record.remote.split(':').pop() ?? '';
        const riskyPort = ['21', '22', '23', '445', '3389', '5900'].includes(remotePort);
        if (status.includes('ESTABLISHED') && remoteHost && !isPrivateIp(remoteHost) && riskyPort) {
          suspicious.push(record);
        }
      }

      const result: Record<string, unknown> = {
        total_connections: records.length,
        by_status: byStatus,
        established_count: established.length,
        listening_count: listening.length,
        suspicious_count: suspicious.length,
        established: established.slice(0, 50),
        listening: listening.slice(0, 50),
        suspicious: suspicious.slice(0, 50),
      };

      if (includeTraffic) {
        const interfaces = os.networkInterfaces();
        result.traffic = {
          interfaces: Object.keys(interfaces),
          note: 'Per-interface byte counters are platform-dependent; only interface inventory is reported.',
        };
      }

      return { success: true, result };
    } catch (error) {
      return { success: false, result: null, error: (error as Error).message };
    }
  }
}
