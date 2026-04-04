import * as net from 'node:net';
import { BaseTool, ToolResult } from '../core/base-tool';

const CAPABILITY_FLAGS: Record<number, string> = {
  0x00000001: 'LONG_PASSWORD',
  0x00000200: 'TRANSACTIONS',
  0x00000800: 'CONNECT_WITH_DB',
  0x00008000: 'SECURE_CONNECTION',
  0x00080000: 'MULTI_STATEMENTS',
  0x00100000: 'MULTI_RESULTS',
  0x00200000: 'PS_MULTI_RESULTS',
  0x00400000: 'PLUGIN_AUTH',
  0x00800000: 'CONNECT_ATTRS',
  0x08000000: 'DEPRECATE_EOF',
};

export class MysqlProbeTool extends BaseTool {
  constructor() {
    super('mysql_probe', 'Probe MySQL greeting packet to identify version and capabilities.');
  }

  async run(params: Record<string, unknown>): Promise<ToolResult> {
    const target = String(params.target ?? '').trim();
    const port = Number(params.port ?? 3306);

    if (!target) {
      return { success: false, result: null, error: 'Missing parameter: target' };
    }

    try {
      const packet = await this.readGreetingPacket(target, port, Number(params.timeout_ms ?? 10_000));
      const parsed = this.parseGreeting(packet, target, port);
      return { success: true, result: parsed };
    } catch (error) {
      const message = (error as NodeJS.ErrnoException).message ?? 'MySQL probe failed';
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ETIMEDOUT') {
        return {
          success: true,
          result: { target, port, mysql_detected: false, message: 'Connection timeout' },
        };
      }
      if (code === 'ECONNREFUSED') {
        return {
          success: true,
          result: { target, port, mysql_detected: false, message: 'Connection refused' },
        };
      }
      return { success: false, result: null, error: `MySQL probe failed: ${message}` };
    }
  }

  private parseGreeting(data: Buffer, target: string, port: number): Record<string, unknown> {
    if (data.length < 5) {
      return {
        target,
        port,
        mysql_detected: false,
        message: 'Response is too short and does not look like MySQL greeting.',
      };
    }

    const payload = data.subarray(4);
    if (payload.length === 0) {
      return {
        target,
        port,
        mysql_detected: false,
        message: 'Empty MySQL payload.',
      };
    }

    if (payload[0] === 0xff) {
      const errCode = payload.length >= 3 ? payload.readUInt16LE(1) : 0;
      const errMsg = payload.subarray(3).toString('utf8').trim();
      return {
        target,
        port,
        mysql_detected: true,
        error_code: errCode,
        error_message: errMsg,
        message: 'MySQL returned an error packet.',
      };
    }

    const protocolVersion = payload[0];
    const versionEnd = payload.indexOf(0x00, 1);
    if (versionEnd <= 0) {
      return {
        target,
        port,
        mysql_detected: true,
        protocol_version: protocolVersion,
        message: 'MySQL greeting did not contain a valid server version string.',
      };
    }

    const serverVersion = payload.subarray(1, versionEnd).toString('utf8');
    let pos = versionEnd + 1;

    let connectionId = 0;
    if (pos + 4 <= payload.length) {
      connectionId = payload.readUInt32LE(pos);
    }
    pos += 4;

    // Auth plugin data part 1 (8 bytes) + filler (1 byte)
    pos += 9;

    let capabilityLower = 0;
    if (pos + 2 <= payload.length) {
      capabilityLower = payload.readUInt16LE(pos);
    }
    pos += 2;

    let charset = 0;
    if (pos < payload.length) {
      charset = payload[pos];
    }
    pos += 1;

    let statusFlags = 0;
    if (pos + 2 <= payload.length) {
      statusFlags = payload.readUInt16LE(pos);
    }
    pos += 2;

    let capabilityUpper = 0;
    if (pos + 2 <= payload.length) {
      capabilityUpper = payload.readUInt16LE(pos);
    }
    const capabilities = capabilityLower | (capabilityUpper << 16);

    const capabilityNames = Object.entries(CAPABILITY_FLAGS)
      .filter(([flag]) => (capabilities & Number(flag)) !== 0)
      .map(([, name]) => name);

    const findings: string[] = [];
    if (/^5\.(0|1|5)/.test(serverVersion)) {
      findings.push(`Outdated MySQL version detected (${serverVersion}).`);
    }
    if ((capabilities & 0x00008000) === 0) {
      findings.push('SECURE_CONNECTION capability not present.');
    }

    return {
      target,
      port,
      mysql_detected: true,
      protocol_version: protocolVersion,
      server_version: serverVersion,
      connection_id: connectionId,
      charset,
      status_flags: statusFlags,
      capabilities: capabilityNames,
      findings,
    };
  }

  private readGreetingPacket(host: string, port: number, timeoutMs: number): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const socket = new net.Socket();
      let settled = false;

      const finish = (error?: Error, data?: Buffer) => {
        if (settled) return;
        settled = true;
        socket.destroy();
        if (error) reject(error);
        else resolve(data ?? Buffer.alloc(0));
      };

      socket.setTimeout(timeoutMs);
      socket.once('data', (chunk: Buffer) => finish(undefined, chunk));
      socket.once('timeout', () => {
        const err = new Error('timeout') as NodeJS.ErrnoException;
        err.code = 'ETIMEDOUT';
        finish(err);
      });
      socket.once('error', (err) => finish(err));
      socket.connect(port, host);
    });
  }
}
