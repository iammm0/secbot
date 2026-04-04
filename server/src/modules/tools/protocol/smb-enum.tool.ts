import * as net from 'node:net';
import { BaseTool, ToolResult } from '../core/base-tool';

const SMB_NEGOTIATE_PACKET = Buffer.from([
  0x00,
  0x00,
  0x00,
  0x55, // NetBIOS header
  0xff,
  0x53,
  0x4d,
  0x42, // SMB1 signature
  0x72, // Negotiate command
  0x00,
  0x00,
  0x00,
  0x00, // status
  0x18, // flags
  0x53,
  0xc8, // flags2
  0x00,
  0x00,
  0x00,
  0x00,
  0x00,
  0x00,
  0x00,
  0x00,
  0x00,
  0x00, // extra
  0x00,
  0x00,
  0x00,
  0x00,
  0x00,
  0x00,
  0x00,
  0x00, // extra
  0x00,
  0x00, // TID
  0xff,
  0xfe, // PID
  0x00,
  0x00, // UID
  0x00,
  0x00, // MID
  0x00, // WCT
  0x24,
  0x00, // BCC
  0x02,
  0x4e,
  0x54,
  0x20,
  0x4c,
  0x4d,
  0x20,
  0x30,
  0x2e,
  0x31,
  0x32,
  0x00, // NT LM 0.12
  0x02,
  0x53,
  0x4d,
  0x42,
  0x20,
  0x32,
  0x2e,
  0x30,
  0x30,
  0x32,
  0x00, // SMB 2.002
  0x02,
  0x53,
  0x4d,
  0x42,
  0x20,
  0x32,
  0x2e,
  0x3f,
  0x3f,
  0x3f,
  0x00, // SMB 2.???
]);

export class SmbEnumTool extends BaseTool {
  constructor() {
    super('smb_enum', 'Enumerate SMB protocol availability and negotiation properties.');
  }

  async run(params: Record<string, unknown>): Promise<ToolResult> {
    const target = String(params.target ?? '').trim();
    const port = Number(params.port ?? 445);
    const timeoutMs = Number(params.timeout_ms ?? 10_000);

    if (!target) {
      return { success: false, result: null, error: 'Missing parameter: target' };
    }

    try {
      const response = await this.negotiate(target, port, timeoutMs);
      return {
        success: true,
        result: this.parseResponse(response, target, port),
      };
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ETIMEDOUT') {
        return {
          success: true,
          result: { target, port, smb_available: false, message: 'Connection timeout' },
        };
      }
      if (code === 'ECONNREFUSED') {
        return {
          success: true,
          result: { target, port, smb_available: false, message: 'Connection refused' },
        };
      }
      return {
        success: false,
        result: null,
        error: `SMB enumeration failed: ${(error as Error).message}`,
      };
    }
  }

  private parseResponse(data: Buffer, target: string, port: number): Record<string, unknown> {
    const result: Record<string, unknown> = {
      target,
      port,
      smb_available: true,
      raw_response_length: data.length,
    };

    if (data.length > 36 && data.subarray(4, 8).equals(Buffer.from([0xff, 0x53, 0x4d, 0x42]))) {
      result.protocol = 'SMB1';
      result.signing = (data[26] & 0x08) === 0x08 ? 'required' : 'optional';
    } else if (
      data.length > 72 &&
      data.subarray(4, 8).equals(Buffer.from([0xfe, 0x53, 0x4d, 0x42]))
    ) {
      result.protocol = 'SMB2+';
      if (data.length > 74) {
        result.dialect = `0x${data.readUInt16LE(72).toString(16).padStart(4, '0')}`;
      }
      if (data.length > 70) {
        result.signing = (data[70] & 0x01) === 0x01 ? 'required' : 'optional';
      }
    } else {
      result.protocol = 'unknown';
    }

    return result;
  }

  private negotiate(host: string, port: number, timeoutMs: number): Promise<Buffer> {
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
      socket.once('connect', () => socket.write(SMB_NEGOTIATE_PACKET));
      socket.once('data', (chunk) => finish(undefined, chunk));
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
