import * as net from 'net';
import { BaseTool, ToolResult } from '../core/base-tool';

const COMMON_PORTS = [21, 22, 23, 25, 53, 80, 110, 143, 443, 445, 3306, 3389, 5432, 8080, 8443];

function scanPort(
  host: string,
  port: number,
  timeout = 1000,
): Promise<{ port: number; open: boolean; status: string }> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(timeout);

    socket.on('connect', () => {
      socket.destroy();
      resolve({ port, open: true, status: 'open' });
    });

    socket.on('timeout', () => {
      socket.destroy();
      resolve({ port, open: false, status: 'filtered' });
    });

    socket.on('error', () => {
      socket.destroy();
      resolve({ port, open: false, status: 'closed' });
    });

    socket.connect(port, host);
  });
}

export class PortScannerTool extends BaseTool {
  constructor() {
    super('port_scan', 'TCP端口扫描 — 扫描目标主机的开放端口');
  }

  async run(params: Record<string, unknown>): Promise<ToolResult> {
    try {
      const host = params.host as string;
      if (!host) {
        return { success: false, result: null, error: '缺少必要参数: host' };
      }

      const ports = (params.ports as number[]) || COMMON_PORTS;
      const results: { port: number; open: boolean; status: string }[] = [];
      const batchSize = 50;

      for (let i = 0; i < ports.length; i += batchSize) {
        const batch = ports.slice(i, i + batchSize);
        const batchResults = await Promise.all(batch.map((port) => scanPort(host, port)));
        results.push(...batchResults);
      }

      const openCount = results.filter((r) => r.open).length;

      return {
        success: true,
        result: { host, ports: results, openCount },
      };
    } catch (error) {
      return {
        success: false,
        result: null,
        error: `端口扫描失败: ${(error as Error).message}`,
      };
    }
  }
}
