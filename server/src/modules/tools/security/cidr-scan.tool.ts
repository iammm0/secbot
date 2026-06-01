import * as net from 'node:net';
import { BaseTool, ToolResult } from '../core/base-tool';

export class CidrScanTool extends BaseTool {
  constructor() {
    super('cidr_scan', '网段扫描 — 对 CIDR 范围批量端口扫描并汇总');
  }

  async run(params: Record<string, unknown>): Promise<ToolResult> {
    const cidr = String(params.cidr ?? '').trim();
    if (!cidr)
      return { success: false, result: null, error: '缺少必要参数: cidr (如 192.168.1.0/24)' };

    const ports = (params.ports as number[]) ?? [22, 80, 443, 3306, 8080];
    const timeoutMs = Math.min(Number(params.timeout_ms) || 1500, 5000);
    const concurrency = Math.min(Number(params.concurrency) || 50, 200);

    const ips = this.expandCidr(cidr);
    if (!ips.length)
      return { success: false, result: null, error: '无效 CIDR 或范围过大 (最大 /20)' };

    const tasks: Array<{ ip: string; port: number }> = [];
    for (const ip of ips) {
      for (const port of ports) {
        tasks.push({ ip, port });
      }
    }

    const results = await this.scanAll(tasks, concurrency, timeoutMs);

    // Group by host
    const hostMap = new Map<string, number[]>();
    for (const r of results) {
      if (r.open) {
        const arr = hostMap.get(r.ip) ?? [];
        arr.push(r.port);
        hostMap.set(r.ip, arr);
      }
    }

    const hosts = [...hostMap.entries()].map(([ip, openPorts]) => ({ ip, open_ports: openPorts }));

    return {
      success: true,
      result: {
        cidr,
        ips_scanned: ips.length,
        ports_per_host: ports,
        total_probes: tasks.length,
        hosts_alive: hosts.length,
        hosts,
      },
    };
  }

  private expandCidr(cidr: string): string[] {
    const [ipStr, maskStr] = cidr.split('/');
    const mask = Number(maskStr);
    if (!ipStr || isNaN(mask) || mask < 20 || mask > 32) return [];

    const parts = ipStr.split('.').map(Number);
    if (parts.length !== 4 || parts.some((p) => p < 0 || p > 255)) return [];

    const ipNum = (parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3];
    const hostBits = 32 - mask;
    const count = 1 << hostBits;
    const network = ipNum & (~0 << hostBits);

    const ips: string[] = [];
    // Skip network and broadcast for /31+
    const start = mask >= 31 ? 0 : 1;
    const end = mask >= 31 ? count : count - 1;

    for (let i = start; i < end; i++) {
      const n = (network + i) >>> 0;
      ips.push(`${(n >> 24) & 0xff}.${(n >> 16) & 0xff}.${(n >> 8) & 0xff}.${n & 0xff}`);
    }
    return ips;
  }

  private async scanAll(
    tasks: Array<{ ip: string; port: number }>,
    concurrency: number,
    timeoutMs: number,
  ): Promise<Array<{ ip: string; port: number; open: boolean }>> {
    const results: Array<{ ip: string; port: number; open: boolean }> = new Array(tasks.length);
    let idx = 0;

    const workers = Array.from({ length: concurrency }, async () => {
      while (idx < tasks.length) {
        const i = idx++;
        results[i] = await this.probePort(tasks[i].ip, tasks[i].port, timeoutMs);
      }
    });

    await Promise.all(workers);
    return results;
  }

  private probePort(
    ip: string,
    port: number,
    timeoutMs: number,
  ): Promise<{ ip: string; port: number; open: boolean }> {
    return new Promise((resolve) => {
      const socket = new net.Socket();
      socket.setTimeout(timeoutMs);

      socket.on('connect', () => {
        socket.destroy();
        resolve({ ip, port, open: true });
      });
      socket.on('timeout', () => {
        socket.destroy();
        resolve({ ip, port, open: false });
      });
      socket.on('error', () => {
        socket.destroy();
        resolve({ ip, port, open: false });
      });

      socket.connect(port, ip);
    });
  }
}
