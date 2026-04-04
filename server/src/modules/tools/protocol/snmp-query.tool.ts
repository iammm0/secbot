import * as dgram from 'node:dgram';
import { randomInt } from 'node:crypto';
import { BaseTool, ToolResult } from '../core/base-tool';

const COMMON_OIDS: Record<string, string> = {
  sysDescr: '1.3.6.1.2.1.1.1.0',
  sysObjectID: '1.3.6.1.2.1.1.2.0',
  sysUpTime: '1.3.6.1.2.1.1.3.0',
  sysContact: '1.3.6.1.2.1.1.4.0',
  sysName: '1.3.6.1.2.1.1.5.0',
  sysLocation: '1.3.6.1.2.1.1.6.0',
  sysServices: '1.3.6.1.2.1.1.7.0',
};

export class SnmpQueryTool extends BaseTool {
  constructor() {
    super(
      'snmp_query',
      'Query SNMPv1 device information (system description, name, uptime, etc.).',
    );
  }

  async run(params: Record<string, unknown>): Promise<ToolResult> {
    const target = String(params.target ?? '').trim();
    const community = String(params.community ?? 'public').trim() || 'public';
    const oidParam = String(params.oid ?? '').trim();
    const timeoutMs = Number(params.timeout_ms ?? 5_000);

    if (!target) {
      return { success: false, result: null, error: 'Missing parameter: target' };
    }

    const toQuery = this.resolveQuerySet(oidParam);
    const results: Record<string, string> = {};

    for (const [name, oid] of Object.entries(toQuery)) {
      try {
        const value = await this.snmpGet(target, community, oid, timeoutMs);
        if (value !== null) {
          results[name] = value;
        }
      } catch (error) {
        results[name] = `Query failed: ${(error as Error).message}`;
      }
    }

    if (Object.keys(results).length === 0) {
      return {
        success: true,
        result: {
          target,
          accessible: false,
          message: 'SNMP service is unreachable or community string is invalid.',
        },
      };
    }

    return {
      success: true,
      result: {
        target,
        community,
        protocol: 'SNMPv1',
        results,
      },
    };
  }

  private resolveQuerySet(oidParam: string): Record<string, string> {
    if (!oidParam) return COMMON_OIDS;
    if (COMMON_OIDS[oidParam]) {
      return { [oidParam]: COMMON_OIDS[oidParam] };
    }
    return { [oidParam]: oidParam };
  }

  private snmpGet(
    target: string,
    community: string,
    oid: string,
    timeoutMs: number,
  ): Promise<string | null> {
    return new Promise((resolve, reject) => {
      const socket = dgram.createSocket('udp4');
      const requestId = randomInt(1, 0x7fffffff);
      const message = this.buildSnmpGetRequest(community, oid, requestId);
      let settled = false;

      const finish = (error?: Error, value?: string | null) => {
        if (settled) return;
        settled = true;
        try {
          socket.close();
        } catch {
          // ignore close failures
        }
        if (error) reject(error);
        else resolve(value ?? null);
      };

      const timer = setTimeout(() => {
        const err = new Error('SNMP timeout') as NodeJS.ErrnoException;
        err.code = 'ETIMEDOUT';
        finish(err);
      }, timeoutMs);

      socket.once('error', (err) => {
        clearTimeout(timer);
        finish(err);
      });

      socket.once('message', (data) => {
        clearTimeout(timer);
        finish(undefined, this.extractValue(data));
      });

      socket.send(message, 161, target, (err) => {
        if (err) {
          clearTimeout(timer);
          finish(err);
        }
      });
    });
  }

  private buildSnmpGetRequest(community: string, oid: string, requestId: number): Buffer {
    const oidParts = oid
      .split('.')
      .map((item) => Number(item))
      .filter((item) => Number.isInteger(item) && item >= 0);

    const encodedOid = this.encodeOid(oidParts);
    const nullValue = Buffer.from([0x05, 0x00]);
    const varbind = this.asn1Sequence(Buffer.concat([encodedOid, nullValue]));
    const varbindList = this.asn1Sequence(varbind);

    const requestIdField = this.asn1Integer(requestId);
    const errorStatus = this.asn1Integer(0);
    const errorIndex = this.asn1Integer(0);
    const pduContent = Buffer.concat([requestIdField, errorStatus, errorIndex, varbindList]);
    const pdu = Buffer.concat([
      Buffer.from([0xa0]),
      this.asn1Length(pduContent.length),
      pduContent,
    ]);

    const version = this.asn1Integer(0); // SNMPv1
    const communityField = Buffer.concat([
      Buffer.from([0x04]),
      this.asn1Length(Buffer.byteLength(community)),
      Buffer.from(community, 'utf8'),
    ]);
    return this.asn1Sequence(Buffer.concat([version, communityField, pdu]));
  }

  private encodeOid(parts: number[]): Buffer {
    if (parts.length < 2) {
      return Buffer.from([0x06, 0x01, 0x00]);
    }

    const encoded: number[] = [parts[0] * 40 + parts[1]];
    for (const part of parts.slice(2)) {
      if (part < 128) {
        encoded.push(part);
        continue;
      }
      const chunks: number[] = [];
      let value = part;
      while (value > 0) {
        chunks.unshift(value & 0x7f);
        value >>= 7;
      }
      for (let i = 0; i < chunks.length - 1; i += 1) {
        chunks[i] |= 0x80;
      }
      encoded.push(...chunks);
    }

    return Buffer.concat([
      Buffer.from([0x06]),
      this.asn1Length(encoded.length),
      Buffer.from(encoded),
    ]);
  }

  private asn1Integer(value: number): Buffer {
    let bytes = Buffer.from([value & 0xff]);
    let temp = value >> 8;
    while (temp > 0) {
      bytes = Buffer.concat([Buffer.from([temp & 0xff]), bytes]);
      temp >>= 8;
    }
    if ((bytes[0] & 0x80) !== 0) {
      bytes = Buffer.concat([Buffer.from([0x00]), bytes]);
    }
    return Buffer.concat([Buffer.from([0x02]), this.asn1Length(bytes.length), bytes]);
  }

  private asn1Length(length: number): Buffer {
    if (length < 0x80) return Buffer.from([length]);
    if (length < 0x100) return Buffer.from([0x81, length]);
    return Buffer.from([0x82, (length >> 8) & 0xff, length & 0xff]);
  }

  private asn1Sequence(content: Buffer): Buffer {
    return Buffer.concat([Buffer.from([0x30]), this.asn1Length(content.length), content]);
  }

  private extractValue(data: Buffer): string | null {
    for (let pos = data.length - 2; pos >= 0; pos -= 1) {
      const tag = data[pos];
      const length = data[pos + 1];
      if (length === undefined || length > 127) continue;
      if (pos + 2 + length > data.length) continue;

      const value = data.subarray(pos + 2, pos + 2 + length);
      if (tag === 0x04) {
        return value.toString('utf8').trim();
      }
      if (tag === 0x02) {
        return String(value.readIntBE(0, value.length));
      }
      if (tag === 0x41 || tag === 0x42 || tag === 0x43) {
        return String(value.readUIntBE(0, value.length));
      }
      if (tag === 0x40 && value.length === 4) {
        return `${value[0]}.${value[1]}.${value[2]}.${value[3]}`;
      }
    }
    return null;
  }
}
