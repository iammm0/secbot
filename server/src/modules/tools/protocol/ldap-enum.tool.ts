import * as net from 'node:net';
import { BaseTool, ToolResult } from '../core/base-tool';

export class LdapEnumTool extends BaseTool {
  constructor() {
    super('ldap_enum', 'LDAP 枚举 — 匿名绑定探测 + 基础信息获取');
  }

  async run(params: Record<string, unknown>): Promise<ToolResult> {
    const host = String(params.host ?? '').trim();
    if (!host) return { success: false, result: null, error: '缺少必要参数: host' };

    const port = Number(params.port) || 389;
    const timeoutMs = Math.min(Number(params.timeout) || 10, 30) * 1000;
    const baseDn = params.base_dn ? String(params.base_dn).trim() : '';

    try {
      const banner = await this.probe(host, port, timeoutMs);
      const anonBind = await this.tryAnonymousBind(host, port, timeoutMs);

      return {
        success: true,
        result: {
          host,
          port,
          reachable: true,
          banner_bytes: banner.length,
          anonymous_bind: anonBind.success,
          root_dse: anonBind.rootDse,
          naming_contexts: anonBind.namingContexts,
          findings: this.getFindings(anonBind),
        },
      };
    } catch (error) {
      return { success: false, result: null, error: `LDAP 枚举失败: ${(error as Error).message}` };
    }
  }

  private probe(host: string, port: number, timeoutMs: number): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const socket = net.createConnection({ host, port });
      const chunks: Buffer[] = [];

      socket.setTimeout(timeoutMs);
      socket.on('data', (c) => { chunks.push(c); socket.destroy(); });
      socket.on('connect', () => {
        // Send a minimal LDAP SearchRequest for RootDSE
        socket.write(this.buildRootDseRequest());
      });
      socket.on('timeout', () => { socket.destroy(); resolve(Buffer.concat(chunks)); });
      socket.on('error', (err) => { socket.destroy(); reject(err); });
      socket.on('close', () => resolve(Buffer.concat(chunks)));
    });
  }

  private tryAnonymousBind(
    host: string,
    port: number,
    timeoutMs: number,
  ): Promise<{ success: boolean; rootDse?: Record<string, string>; namingContexts?: string[] }> {
    return new Promise((resolve) => {
      const socket = net.createConnection({ host, port });
      const chunks: Buffer[] = [];
      let phase = 0;

      socket.setTimeout(timeoutMs);

      socket.on('connect', () => {
        // Anonymous simple bind
        socket.write(this.buildBindRequest());
        phase = 1;
      });

      socket.on('data', (chunk) => {
        chunks.push(chunk);
        if (phase === 1) {
          // Check bind response — resultCode at known offset
          const data = Buffer.concat(chunks);
          if (data.length > 10) {
            const bindSuccess = this.checkBindResult(data);
            if (bindSuccess) {
              // Send RootDSE search
              socket.write(this.buildRootDseRequest());
              phase = 2;
              chunks.length = 0;
            } else {
              socket.destroy();
              resolve({ success: false });
            }
          }
        } else if (phase === 2) {
          // Collect search response
          setTimeout(() => {
            socket.destroy();
            const data = Buffer.concat(chunks);
            const info = this.parseSearchResponse(data);
            resolve({ success: true, ...info });
          }, 500);
        }
      });

      socket.on('timeout', () => { socket.destroy(); resolve({ success: chunks.length > 0 }); });
      socket.on('error', () => { socket.destroy(); resolve({ success: false }); });
    });
  }

  private buildBindRequest(): Buffer {
    // Minimal LDAP BindRequest: version=3, name="", simple auth=""
    return Buffer.from([
      0x30, 0x0c, // SEQUENCE, length 12
      0x02, 0x01, 0x01, // messageID = 1
      0x60, 0x07, // BindRequest, length 7
      0x02, 0x01, 0x03, // version = 3
      0x04, 0x00, // name = ""
      0x80, 0x00, // simple auth = ""
    ]);
  }

  private buildRootDseRequest(): Buffer {
    // SearchRequest: baseObject="", scope=base, filter=(objectClass=*), attrs=[namingContexts,defaultNamingContext,dnsHostName]
    return Buffer.from([
      0x30, 0x25, // SEQUENCE
      0x02, 0x01, 0x02, // messageID = 2
      0x63, 0x20, // SearchRequest
      0x04, 0x00, // baseObject = ""
      0x0a, 0x01, 0x00, // scope = base
      0x0a, 0x01, 0x00, // derefAliases = never
      0x02, 0x01, 0x00, // sizeLimit = 0
      0x02, 0x01, 0x00, // timeLimit = 0
      0x01, 0x01, 0x00, // typesOnly = false
      0x87, 0x0b, 0x6f, 0x62, 0x6a, 0x65, 0x63, 0x74, 0x43, 0x6c, 0x61, 0x73, 0x73, // filter: objectClass present
      0x30, 0x00, // attributes: all
    ]);
  }

  private checkBindResult(data: Buffer): boolean {
    // Look for resultCode = 0 (success) in BindResponse
    // BindResponse tag = 0x61
    const idx = data.indexOf(0x61);
    if (idx < 0) return false;
    // resultCode is an ENUMERATED after the tag+length
    const rcIdx = data.indexOf(0x0a, idx);
    if (rcIdx < 0) return false;
    return data[rcIdx + 2] === 0x00;
  }

  private parseSearchResponse(data: Buffer): { rootDse?: Record<string, string>; namingContexts?: string[] } {
    // Extract readable strings from the response
    const text = data.toString('utf8', 0, Math.min(data.length, 4000));
    const namingContexts: string[] = [];

    const dcMatches = text.match(/(?:DC=[^,\x00]+(?:,DC=[^,\x00]+)*)/gi);
    if (dcMatches) {
      for (const m of dcMatches) namingContexts.push(m);
    }

    return {
      namingContexts: [...new Set(namingContexts)].slice(0, 10),
    };
  }

  private getFindings(result: { success: boolean }): string[] {
    const findings: string[] = [];
    if (result.success) {
      findings.push('匿名绑定成功 — LDAP 服务器允许未认证访问，应限制匿名查询');
    }
    return findings;
  }
}
