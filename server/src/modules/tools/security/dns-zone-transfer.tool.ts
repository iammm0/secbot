import * as dns from 'node:dns/promises';
import * as net from 'node:net';
import { BaseTool, ToolResult } from '../core/base-tool';

export class DnsZoneTransferTool extends BaseTool {
  constructor() {
    super('dns_zone_transfer', 'DNS 区域传送 — 尝试 AXFR 获取完整 DNS 记录');
  }

  async run(params: Record<string, unknown>): Promise<ToolResult> {
    const domain = String(params.domain ?? '').trim();
    if (!domain) return { success: false, result: null, error: '缺少必要参数: domain' };

    const nameserver = params.nameserver ? String(params.nameserver).trim() : undefined;
    const timeoutMs = Math.min(Number(params.timeout) || 15, 60) * 1000;

    try {
      const nsServers = nameserver ? [nameserver] : await this.getNs(domain);
      if (!nsServers.length) {
        return { success: false, result: null, error: `无法获取 ${domain} 的 NS 记录` };
      }

      const results: Array<{ ns: string; success: boolean; records?: string[]; error?: string }> =
        [];

      for (const ns of nsServers) {
        const r = await this.tryAxfr(domain, ns, timeoutMs);
        results.push(r);
      }

      const vulnerable = results.some((r) => r.success);

      return {
        success: true,
        result: {
          domain,
          nameservers_tested: nsServers,
          zone_transfer_allowed: vulnerable,
          results,
          note: vulnerable
            ? '区域传送成功 — DNS 服务器配置不当，应限制 AXFR 访问'
            : '所有 NS 均拒绝区域传送',
        },
      };
    } catch (error) {
      return {
        success: false,
        result: null,
        error: `DNS 区域传送失败: ${(error as Error).message}`,
      };
    }
  }

  private async getNs(domain: string): Promise<string[]> {
    try {
      const records = await dns.resolveNs(domain);
      return records.slice(0, 5);
    } catch {
      return [];
    }
  }

  private tryAxfr(
    domain: string,
    ns: string,
    timeoutMs: number,
  ): Promise<{ ns: string; success: boolean; records?: string[]; error?: string }> {
    return new Promise((resolve) => {
      const socket = net.createConnection({ host: ns, port: 53 });
      const chunks: Buffer[] = [];
      let done = false;

      socket.setTimeout(timeoutMs);

      const finish = (success: boolean, records?: string[], error?: string) => {
        if (done) return;
        done = true;
        socket.destroy();
        resolve({ ns, success, records, error });
      };

      socket.on('connect', () => {
        const query = this.buildAxfrQuery(domain);
        // TCP DNS: 2-byte length prefix
        const lenBuf = Buffer.alloc(2);
        lenBuf.writeUInt16BE(query.length);
        socket.write(Buffer.concat([lenBuf, query]));
      });

      socket.on('data', (chunk) => {
        chunks.push(chunk);
      });

      socket.on('end', () => {
        const data = Buffer.concat(chunks);
        if (data.length < 4) {
          finish(false, undefined, 'AXFR 被拒绝或无响应');
          return;
        }
        // Skip 2-byte TCP length, check DNS header RCODE
        const offset = 2;
        if (data.length < offset + 12) {
          finish(false, undefined, '响应过短');
          return;
        }
        const flags = data.readUInt16BE(offset + 2);
        const rcode = flags & 0x0f;
        const ancount = data.readUInt16BE(offset + 6);

        if (rcode !== 0 || ancount === 0) {
          finish(false, undefined, `RCODE=${rcode}, ANCOUNT=${ancount} — 传送被拒绝`);
        } else {
          const records = this.extractNames(data.slice(offset), domain);
          finish(true, records);
        }
      });

      socket.on('timeout', () => finish(false, undefined, '连接超时'));
      socket.on('error', (err) => finish(false, undefined, err.message));
    });
  }

  private buildAxfrQuery(domain: string): Buffer {
    // Minimal DNS AXFR query
    const id = Buffer.alloc(2);
    id.writeUInt16BE(Math.floor(Math.random() * 0xffff));

    const flags = Buffer.from([0x00, 0x00]); // standard query
    const counts = Buffer.from([0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]); // QDCOUNT=1

    // Encode domain name
    const labels = domain.split('.').map((label) => {
      const buf = Buffer.alloc(1 + label.length);
      buf.writeUInt8(label.length, 0);
      buf.write(label, 1, 'ascii');
      return buf;
    });
    const qname = Buffer.concat([...labels, Buffer.from([0x00])]);

    // QTYPE=AXFR(252), QCLASS=IN(1)
    const qtype = Buffer.from([0x00, 0xfc, 0x00, 0x01]);

    return Buffer.concat([id, flags, counts, qname, qtype]);
  }

  private extractNames(data: Buffer, domain: string): string[] {
    // Simple extraction: find readable domain-like strings in the response
    const text = data.toString('ascii');
    const pattern = new RegExp(`[a-z0-9._-]+\\.${domain.replace(/\./g, '\\.')}`, 'gi');
    const matches = text.match(pattern) ?? [];
    return [...new Set(matches)].slice(0, 200);
  }
}
