import * as net from 'node:net';
import { BaseTool, ToolResult } from '../core/base-tool';

export class FtpProbeTool extends BaseTool {
  constructor() {
    super('ftp_probe', 'FTP 探测 — Banner 抓取、匿名登录检测');
  }

  async run(params: Record<string, unknown>): Promise<ToolResult> {
    const host = String(params.host ?? '').trim();
    if (!host) return { success: false, result: null, error: '缺少必要参数: host' };

    const port = Number(params.port) || 21;
    const checkAnon = params.check_anonymous !== false;
    const timeoutMs = Math.min(Number(params.timeout) || 10, 30) * 1000;

    try {
      const banner = await this.getBanner(host, port, timeoutMs);
      const result: Record<string, unknown> = {
        host,
        port,
        banner: banner.trim(),
        ...this.analyzeBanner(banner),
      };

      if (checkAnon) {
        result.anonymous_login = await this.tryAnonymous(host, port, timeoutMs);
      }

      return { success: true, result };
    } catch (error) {
      return { success: false, result: null, error: `FTP 探测失败: ${(error as Error).message}` };
    }
  }

  private getBanner(host: string, port: number, timeoutMs: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const socket = net.createConnection({ host, port });
      let data = '';

      socket.setTimeout(timeoutMs);
      socket.setEncoding('utf8');

      socket.on('data', (chunk) => {
        data += chunk;
        if (data.includes('\n')) {
          socket.destroy();
          resolve(data);
        }
      });

      socket.on('timeout', () => {
        socket.destroy();
        reject(new Error('连接超时'));
      });
      socket.on('error', (err) => reject(err));
      socket.on('close', () => {
        if (data) resolve(data);
        else reject(new Error('无响应'));
      });
    });
  }

  private tryAnonymous(host: string, port: number, timeoutMs: number): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = net.createConnection({ host, port });
      let phase = 0; // 0=banner, 1=USER sent, 2=PASS sent
      let buf = '';

      socket.setTimeout(timeoutMs);
      socket.setEncoding('utf8');

      const cleanup = () => {
        socket.destroy();
      };

      socket.on('data', (chunk) => {
        buf += chunk;
        const lines = buf.split('\r\n');
        buf = lines.pop() ?? '';

        for (const line of lines) {
          const code = parseInt(line.slice(0, 3), 10);
          if (phase === 0 && code === 220) {
            phase = 1;
            socket.write('USER anonymous\r\n');
          } else if (phase === 1 && (code === 331 || code === 230)) {
            if (code === 230) {
              cleanup();
              resolve(true);
              return;
            }
            phase = 2;
            socket.write('PASS anonymous@\r\n');
          } else if (phase === 2) {
            cleanup();
            resolve(code === 230);
            return;
          } else if (code >= 500) {
            cleanup();
            resolve(false);
            return;
          }
        }
      });

      socket.on('timeout', () => {
        cleanup();
        resolve(false);
      });
      socket.on('error', () => {
        cleanup();
        resolve(false);
      });
    });
  }

  private analyzeBanner(banner: string): Record<string, unknown> {
    const findings: string[] = [];
    const line = banner.split('\n')[0].trim();

    if (/vsftpd\s*2\./i.test(line))
      findings.push('vsftpd 2.x — 检查是否受后门漏洞影响 (CVE-2011-2523)');
    if (/ProFTPD\s*1\.[0-2]/i.test(line)) findings.push('ProFTPD 旧版本 — 可能存在已知 RCE');
    if (/FileZilla Server/i.test(line))
      findings.push('FileZilla Server — 检查版本是否有路径遍历漏洞');
    if (/Pure-FTPd/i.test(line)) findings.push('Pure-FTPd 检测到');

    return { software: line.replace(/^220[\s-]*/, ''), findings };
  }
}
