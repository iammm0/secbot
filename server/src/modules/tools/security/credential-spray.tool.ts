import * as net from 'node:net';
import { BaseTool, ToolResult } from '../core/base-tool';

interface Target {
  protocol: string;
  host: string;
  port: number;
  path?: string;
}

export class CredentialSprayTool extends BaseTool {
  constructor() {
    super('credential_spray', '凭据喷洒 — 多协议弱口令检测 (HTTP/FTP/SSH banner)', true);
  }

  async run(params: Record<string, unknown>): Promise<ToolResult> {
    const target = String(params.target ?? '').trim();
    if (!target) return { success: false, result: null, error: '缺少必要参数: target' };

    const usernames = (params.usernames as string[]) ?? ['admin', 'root', 'test', 'user'];
    const passwords = (params.passwords as string[]) ?? ['admin', '123456', 'password', 'root', 'test', ''];
    const protocol = String(params.protocol ?? 'http').toLowerCase();
    const delay = Math.max(Number(params.delay_ms) || 500, 100);
    const timeoutMs = Math.min(Number(params.timeout) || 10, 30) * 1000;

    const parsed = this.parseTarget(target, protocol);
    const results: Array<Record<string, unknown>> = [];

    for (const user of usernames) {
      for (const pass of passwords) {
        const r = await this.tryCredential(parsed, user, pass, timeoutMs);
        results.push(r);
        if (r.success) break; // found valid cred for this user
        await this.sleep(delay);
      }
    }

    const valid = results.filter((r) => r.success);

    return {
      success: true,
      result: {
        target,
        protocol: parsed.protocol,
        attempts: results.length,
        valid_credentials: valid,
        all_results: results.slice(0, 50),
      },
    };
  }

  private parseTarget(target: string, protocol: string): Target {
    if (target.includes('://')) {
      const url = new URL(target);
      return { protocol: url.protocol.replace(':', ''), host: url.hostname, port: Number(url.port) || (url.protocol === 'https:' ? 443 : 80), path: url.pathname };
    }
    const [host, portStr] = target.split(':');
    const defaultPorts: Record<string, number> = { http: 80, https: 443, ftp: 21, ssh: 22 };
    return { protocol, host, port: Number(portStr) || defaultPorts[protocol] || 80 };
  }

  private async tryCredential(
    target: Target,
    username: string,
    password: string,
    timeoutMs: number,
  ): Promise<Record<string, unknown>> {
    switch (target.protocol) {
      case 'http':
      case 'https':
        return this.tryHttp(target, username, password, timeoutMs);
      case 'ftp':
        return this.tryFtp(target, username, password, timeoutMs);
      default:
        return { username, password, success: false, error: `不支持的协议: ${target.protocol}` };
    }
  }

  private async tryHttp(target: Target, username: string, password: string, timeoutMs: number): Promise<Record<string, unknown>> {
    const base = `${target.protocol}://${target.host}:${target.port}`;
    const url = target.path ?? '/';

    try {
      const resp = await fetch(base + url, {
        headers: {
          'Authorization': 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64'),
          'User-Agent': 'secbot/1.0',
        },
        signal: AbortSignal.timeout(timeoutMs),
        redirect: 'manual',
      });

      const success = resp.status !== 401 && resp.status !== 403;
      return { username, password, success, status: resp.status };
    } catch (error) {
      return { username, password, success: false, error: (error as Error).message };
    }
  }

  private tryFtp(target: Target, username: string, password: string, timeoutMs: number): Promise<Record<string, unknown>> {
    return new Promise((resolve) => {
      const socket = net.createConnection({ host: target.host, port: target.port });
      let phase = 0;
      let buf = '';

      socket.setTimeout(timeoutMs);
      socket.setEncoding('utf8');

      const finish = (success: boolean, code?: number) => {
        socket.destroy();
        resolve({ username, password, success, code });
      };

      socket.on('data', (chunk) => {
        buf += chunk;
        const lines = buf.split('\r\n');
        buf = lines.pop() ?? '';

        for (const line of lines) {
          const code = parseInt(line.slice(0, 3), 10);
          if (phase === 0 && code === 220) { phase = 1; socket.write(`USER ${username}\r\n`); }
          else if (phase === 1 && (code === 331 || code === 230)) {
            if (code === 230) { finish(true, 230); return; }
            phase = 2; socket.write(`PASS ${password}\r\n`);
          }
          else if (phase === 2) { finish(code === 230, code); return; }
          else if (code >= 500) { finish(false, code); return; }
        }
      });

      socket.on('timeout', () => finish(false));
      socket.on('error', () => finish(false));
    });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }
}
