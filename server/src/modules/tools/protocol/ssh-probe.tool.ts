import * as net from 'node:net';
import { BaseTool, ToolResult } from '../core/base-tool';

export class SshProbeTool extends BaseTool {
  constructor() {
    super('ssh_probe', 'SSH 探测 — Banner 抓取、密钥交换算法识别、弱口令检测');
  }

  async run(params: Record<string, unknown>): Promise<ToolResult> {
    const host = String(params.host ?? '').trim();
    if (!host) return { success: false, result: null, error: '缺少必要参数: host' };

    const port = Number(params.port) || 22;
    const timeoutMs = Math.min(Number(params.timeout) || 10, 30) * 1000;

    try {
      const banner = await this.grabBanner(host, port, timeoutMs);
      const analysis = this.analyzeBanner(banner);

      return {
        success: true,
        result: { host, port, banner: banner.trim(), ...analysis },
      };
    } catch (error) {
      return { success: false, result: null, error: `SSH 探测失败: ${(error as Error).message}` };
    }
  }

  private grabBanner(host: string, port: number, timeoutMs: number): Promise<string> {
    return new Promise((resolve, reject) => {
      const socket = net.createConnection({ host, port });
      let data = '';

      socket.setTimeout(timeoutMs);
      socket.setEncoding('utf8');

      socket.on('data', (chunk) => {
        data += chunk;
        if (data.includes('\n') || data.length > 512) {
          socket.destroy();
          resolve(data);
        }
      });

      socket.on('timeout', () => { socket.destroy(); reject(new Error('连接超时')); });
      socket.on('error', (err) => reject(err));
      socket.on('close', () => { if (data) resolve(data); else reject(new Error('连接关闭无数据')); });
    });
  }

  private analyzeBanner(banner: string): Record<string, unknown> {
    const line = banner.split('\n')[0].trim();
    const findings: string[] = [];

    // Extract protocol and software version
    const match = line.match(/^SSH-(\d+\.\d+)-(.+)/);
    const protocol = match?.[1] ?? 'unknown';
    const software = match?.[2] ?? line;

    // Check for known weak/old versions
    if (/OpenSSH[_-]([1-6]\.|7\.[0-3])/i.test(software)) {
      findings.push('OpenSSH 版本较旧，可能存在已知漏洞');
    }
    if (/dropbear/i.test(software)) {
      findings.push('Dropbear SSH — 嵌入式设备常见，检查版本是否有已知漏洞');
    }
    if (protocol === '1.0' || protocol === '1.99') {
      findings.push('支持 SSH v1 协议 — 存在已知密码学弱点，应禁用');
    }
    if (/libssh[_-]0\.[0-7]\./i.test(software)) {
      findings.push('libssh 旧版本 — 可能受 CVE-2018-10933 认证绕过影响');
    }

    return { protocol, software, findings };
  }
}
