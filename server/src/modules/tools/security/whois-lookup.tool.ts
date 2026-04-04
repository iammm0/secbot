import * as net from 'net';
import { BaseTool, ToolResult } from '../core/base-tool';

export class WhoisLookupTool extends BaseTool {
  constructor() {
    super('whois_lookup', 'WHOIS查询 — 查询域名或IP的注册信息');
  }

  async run(params: Record<string, unknown>): Promise<ToolResult> {
    try {
      const target = params.target as string;
      if (!target) {
        return { success: false, result: null, error: '缺少必要参数: target' };
      }

      const whoisData = await this.queryWhois(target);

      return {
        success: true,
        result: { target, whoisData },
      };
    } catch (error) {
      return {
        success: false,
        result: null,
        error: `WHOIS查询失败: ${(error as Error).message}`,
      };
    }
  }

  private queryWhois(target: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const socket = new net.Socket();
      let data = '';

      socket.setTimeout(10000);
      socket.connect(43, 'whois.iana.org', () => {
        socket.write(`${target}\r\n`);
      });

      socket.on('data', (chunk) => {
        data += chunk.toString();
      });

      socket.on('end', () => {
        resolve(data);
      });

      socket.on('timeout', () => {
        socket.destroy();
        reject(new Error('WHOIS查询超时'));
      });

      socket.on('error', (err) => {
        reject(err);
      });
    });
  }
}
