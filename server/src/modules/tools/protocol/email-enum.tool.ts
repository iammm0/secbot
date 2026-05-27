import * as net from 'node:net';
import * as dns from 'node:dns/promises';
import { BaseTool, ToolResult } from '../core/base-tool';

export class EmailEnumTool extends BaseTool {
  constructor() {
    super('email_enum', 'SMTP 用户枚举 — 通过 VRFY/RCPT TO 验证邮箱地址是否存在');
  }

  async run(params: Record<string, unknown>): Promise<ToolResult> {
    const domain = String(params.domain ?? '').trim();
    const users = params.users as string[] | undefined;
    const method = String(params.method ?? 'rcpt').trim() as 'vrfy' | 'rcpt';

    if (!domain) return { success: false, result: null, error: '缺少必要参数: domain' };

    const targetUsers = users?.length ? users : [
      'admin', 'root', 'info', 'support', 'contact', 'webmaster',
      'postmaster', 'sales', 'test', 'user', 'mail', 'office',
    ];

    const timeoutMs = Math.min(Number(params.timeout) || 15, 60) * 1000;

    try {
      const mxHost = await this.resolveMx(domain);
      if (!mxHost) {
        return { success: false, result: null, error: `无法解析 ${domain} 的 MX 记录` };
      }

      const results = await this.enumerate(mxHost, domain, targetUsers, method, timeoutMs);

      return {
        success: true,
        result: {
          domain,
          mx_host: mxHost,
          method,
          users_checked: targetUsers.length,
          valid: results.filter((r) => r.valid),
          invalid: results.filter((r) => !r.valid),
        },
      };
    } catch (error) {
      return { success: false, result: null, error: `SMTP 枚举失败: ${(error as Error).message}` };
    }
  }

  private async resolveMx(domain: string): Promise<string | null> {
    try {
      const records = await dns.resolveMx(domain);
      if (!records.length) return null;
      records.sort((a, b) => a.priority - b.priority);
      return records[0].exchange;
    } catch {
      return null;
    }
  }

  private enumerate(
    mxHost: string,
    domain: string,
    users: string[],
    method: 'vrfy' | 'rcpt',
    timeoutMs: number,
  ): Promise<Array<{ user: string; valid: boolean; code: number }>> {
    return new Promise((resolve) => {
      const socket = net.createConnection({ host: mxHost, port: 25 });
      const results: Array<{ user: string; valid: boolean; code: number }> = [];
      let phase = 0; // 0=banner, 1=EHLO, 2=MAIL FROM (rcpt only), 3+=enum
      let idx = 0;
      let buf = '';

      socket.setTimeout(timeoutMs);
      socket.setEncoding('utf8');

      const finish = () => { socket.write('QUIT\r\n'); socket.destroy(); resolve(results); };

      const sendNext = () => {
        if (idx >= users.length) { finish(); return; }
        const email = `${users[idx]}@${domain}`;
        if (method === 'vrfy') {
          socket.write(`VRFY ${email}\r\n`);
        } else {
          socket.write(`RCPT TO:<${email}>\r\n`);
        }
      };

      socket.on('data', (chunk) => {
        buf += chunk;
        const lines = buf.split('\r\n');
        buf = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.trim()) continue;
          const code = parseInt(line.slice(0, 3), 10);

          if (phase === 0 && code === 220) {
            phase = 1;
            socket.write(`EHLO secbot.local\r\n`);
          } else if (phase === 1 && code === 250) {
            if (method === 'rcpt') {
              phase = 2;
              socket.write(`MAIL FROM:<test@secbot.local>\r\n`);
            } else {
              phase = 3;
              sendNext();
            }
          } else if (phase === 2 && code === 250) {
            phase = 3;
            sendNext();
          } else if (phase >= 3) {
            results.push({
              user: users[idx],
              valid: code === 250 || code === 252,
              code,
            });
            idx++;
            sendNext();
          }
        }
      });

      socket.on('timeout', () => { socket.destroy(); resolve(results); });
      socket.on('error', () => { socket.destroy(); resolve(results); });
    });
  }
}
