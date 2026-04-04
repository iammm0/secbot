import * as tls from 'tls';
import { BaseTool, ToolResult } from '../core/base-tool';

export class SslAnalyzerTool extends BaseTool {
  constructor() {
    super('ssl_analyze', 'SSL/TLS分析 — 分析目标的SSL/TLS证书和配置');
  }

  async run(params: Record<string, unknown>): Promise<ToolResult> {
    try {
      const host = params.host as string;
      if (!host) {
        return { success: false, result: null, error: '缺少必要参数: host' };
      }

      const port = (params.port as number) || 443;
      const certInfo = await this.getCertInfo(host, port);

      return {
        success: true,
        result: {
          host,
          port,
          ...certInfo,
        },
      };
    } catch (error) {
      return {
        success: false,
        result: null,
        error: `SSL/TLS分析失败: ${(error as Error).message}`,
      };
    }
  }

  private getCertInfo(host: string, port: number): Promise<Record<string, unknown>> {
    return new Promise((resolve, reject) => {
      const socket = tls.connect({ host, port, rejectUnauthorized: false, timeout: 5000 }, () => {
        const cert = socket.getPeerCertificate();
        const protocol = socket.getProtocol();

        socket.end();

        resolve({
          valid: socket.authorized,
          issuer: cert.issuer || {},
          subject: cert.subject || {},
          validFrom: cert.valid_from || '',
          validTo: cert.valid_to || '',
          protocol: protocol || 'unknown',
        });
      });

      socket.on('error', (err) => {
        reject(err);
      });

      socket.on('timeout', () => {
        socket.destroy();
        reject(new Error('SSL连接超时'));
      });
    });
  }
}
