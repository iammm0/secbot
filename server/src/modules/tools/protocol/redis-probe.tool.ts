import * as net from 'node:net';
import { BaseTool, ToolResult } from '../core/base-tool';

type RedisProbeResult = {
  target: string;
  port: number;
  accessible: boolean;
  auth_required: boolean;
  info: Record<string, unknown>;
  risk_level: 'critical' | 'high' | 'low';
  findings: string[];
  message?: string;
};

export class RedisProbeTool extends BaseTool {
  constructor() {
    super('redis_probe', 'Probe Redis for unauthenticated access and insecure configuration.');
  }

  async run(params: Record<string, unknown>): Promise<ToolResult> {
    const target = String(params.target ?? '').trim();
    const port = Number(params.port ?? 6379);
    const timeoutMs = Number(params.timeout_ms ?? 10_000);

    if (!target) {
      return { success: false, result: null, error: 'Missing parameter: target' };
    }

    try {
      const result = await this.probe(target, port, timeoutMs);
      return { success: true, result };
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ETIMEDOUT') {
        return {
          success: true,
          result: { target, port, accessible: false, message: 'Connection timeout' },
        };
      }
      if (code === 'ECONNREFUSED') {
        return {
          success: true,
          result: { target, port, accessible: false, message: 'Connection refused' },
        };
      }
      return {
        success: false,
        result: null,
        error: `Redis probe failed: ${(error as Error).message}`,
      };
    }
  }

  private async probe(target: string, port: number, timeoutMs: number): Promise<RedisProbeResult> {
    const socket = await this.connect(target, port, timeoutMs);
    try {
      const result: RedisProbeResult = {
        target,
        port,
        accessible: false,
        auth_required: false,
        info: {},
        risk_level: 'low',
        findings: [],
      };

      const ping = await this.sendCommand(socket, 'PING\r\n', timeoutMs);

      if (ping.includes('+PONG')) {
        result.accessible = true;
        result.auth_required = false;
        result.risk_level = 'high';
        result.findings.push('Redis allows unauthenticated access (PING returned PONG).');
      } else if (/NOAUTH|authentication required/i.test(ping)) {
        result.accessible = true;
        result.auth_required = true;
        result.findings.push('Redis requires authentication.');
        return result;
      } else {
        result.findings.push(`Unexpected Redis response: ${ping.slice(0, 200)}`);
        return result;
      }

      const infoResp = await this.sendCommand(socket, 'INFO server\r\n', timeoutMs).catch(() => '');
      if (infoResp && !infoResp.startsWith('-')) {
        const parsed = this.parseInfoResponse(infoResp);
        result.info = {
          redis_version: parsed.redis_version,
          os: parsed.os,
          arch_bits: parsed.arch_bits,
          tcp_port: parsed.tcp_port,
          uptime_in_days: parsed.uptime_in_days,
          config_file: parsed.config_file,
          executable: parsed.executable,
        };
      }

      const configResp = await this.sendCommand(socket, 'CONFIG GET dir\r\n', timeoutMs).catch(() => '');
      if (configResp && !configResp.startsWith('-')) {
        result.risk_level = 'critical';
        result.findings.push('CONFIG GET is executable and may enable write-to-disk attacks.');
      }

      const dbSizeResp = await this.sendCommand(socket, 'DBSIZE\r\n', timeoutMs).catch(() => '');
      const dbSizeMatch = dbSizeResp.trim().match(/^:(\d+)/);
      if (dbSizeMatch) {
        result.info.db_size = Number(dbSizeMatch[1]);
      }

      return result;
    } finally {
      socket.destroy();
    }
  }

  private parseInfoResponse(response: string): Record<string, string> {
    const parsed: Record<string, string> = {};
    for (const line of response.split('\r\n')) {
      if (!line || line.startsWith('#') || line.startsWith('$') || line.startsWith('*')) {
        continue;
      }
      const idx = line.indexOf(':');
      if (idx <= 0) continue;
      const key = line.slice(0, idx).trim();
      const value = line.slice(idx + 1).trim();
      parsed[key] = value;
    }
    return parsed;
  }

  private connect(host: string, port: number, timeoutMs: number): Promise<net.Socket> {
    return new Promise((resolve, reject) => {
      const socket = new net.Socket();
      let settled = false;

      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        if (error) {
          socket.destroy();
          reject(error);
          return;
        }
        resolve(socket);
      };

      socket.setTimeout(timeoutMs);
      socket.once('connect', () => finish());
      socket.once('timeout', () => {
        const err = new Error('timeout') as NodeJS.ErrnoException;
        err.code = 'ETIMEDOUT';
        finish(err);
      });
      socket.once('error', (err) => finish(err));
      socket.connect(port, host);
    });
  }

  private sendCommand(socket: net.Socket, command: string, timeoutMs: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const chunks: Buffer[] = [];
      let settled = false;
      let idleTimer: NodeJS.Timeout | null = null;

      const hardTimer = setTimeout(() => {
        cleanup(new Error('Redis response timeout'));
      }, timeoutMs);

      const cleanup = (error?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(hardTimer);
        if (idleTimer) clearTimeout(idleTimer);
        socket.off('data', onData);
        socket.off('error', onError);
        socket.off('close', onClose);

        if (error) {
          reject(error);
          return;
        }
        resolve(Buffer.concat(chunks).toString('utf8'));
      };

      const scheduleResolve = () => {
        if (idleTimer) clearTimeout(idleTimer);
        idleTimer = setTimeout(() => cleanup(), 80);
      };

      const onData = (chunk: Buffer) => {
        chunks.push(chunk);
        scheduleResolve();
      };

      const onError = (err: Error) => cleanup(err);
      const onClose = () => scheduleResolve();

      socket.on('data', onData);
      socket.once('error', onError);
      socket.once('close', onClose);
      socket.write(command);
    });
  }
}
