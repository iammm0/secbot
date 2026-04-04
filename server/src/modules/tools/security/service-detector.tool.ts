import { BaseTool, ToolResult } from '../core/base-tool';
import { PortScannerTool } from './port-scanner.tool';

const PORT_SERVICES: Record<number, string> = {
  21: 'ftp',
  22: 'ssh',
  23: 'telnet',
  25: 'smtp',
  53: 'dns',
  80: 'http',
  110: 'pop3',
  143: 'imap',
  443: 'https',
  445: 'smb',
  3306: 'mysql',
  3389: 'rdp',
  5432: 'postgresql',
  6379: 'redis',
  8080: 'http',
  8443: 'https',
  27017: 'mongodb',
};

export class ServiceDetectorTool extends BaseTool {
  private portScanner = new PortScannerTool();

  constructor() {
    super('service_detect', '服务识别 — 识别目标端口上运行的服务');
  }

  async run(params: Record<string, unknown>): Promise<ToolResult> {
    try {
      const host = params.host as string;
      if (!host) {
        return { success: false, result: null, error: '缺少必要参数: host' };
      }

      let ports = params.ports as number[] | undefined;

      if (!ports || ports.length === 0) {
        const scanResult = await this.portScanner.run({ host });
        if (!scanResult.success) {
          return scanResult;
        }
        const scanData = scanResult.result as {
          ports: { port: number; open: boolean }[];
        };
        ports = scanData.ports.filter((p) => p.open).map((p) => p.port);
      }

      const services = ports.map((port) => ({
        port,
        service: PORT_SERVICES[port] || 'unknown',
        name: PORT_SERVICES[port] ? PORT_SERVICES[port].toUpperCase() : `未知服务 (端口 ${port})`,
      }));

      return {
        success: true,
        result: { host, services },
      };
    } catch (error) {
      return {
        success: false,
        result: null,
        error: `服务识别失败: ${(error as Error).message}`,
      };
    }
  }
}
