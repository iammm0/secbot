import { spawn } from 'node:child_process';
import { platform } from 'node:os';
import { BaseTool, ToolResult } from '../core/base-tool';

export class WifiScanTool extends BaseTool {
  constructor() {
    super('wifi_scan', '无线网络扫描 — 列出周围 WiFi 网络及安全配置');
  }

  async run(params: Record<string, unknown>): Promise<ToolResult> {
    const timeoutSec = Math.min(Number(params.timeout) || 10, 30);
    const os = platform();

    let result: { stdout: string; error?: string };

    if (os === 'darwin') {
      result = await this.exec(
        '/System/Library/PrivateFrameworks/Apple80211.framework/Versions/Current/Resources/airport',
        ['-s'],
        timeoutSec,
      );
    } else if (os === 'linux') {
      result = await this.exec('iwlist', ['scan'], timeoutSec);
      if (result.error) {
        result = await this.exec('nmcli', ['dev', 'wifi', 'list'], timeoutSec);
      }
    } else {
      result = await this.exec('netsh', ['wlan', 'show', 'networks', 'mode=bssid'], timeoutSec);
    }

    if (result.error) return { success: false, result: null, error: result.error };

    const networks = os === 'darwin'
      ? this.parseMacOS(result.stdout)
      : os === 'linux'
        ? this.parseLinux(result.stdout)
        : this.parseWindows(result.stdout);

    return {
      success: true,
      result: { platform: os, networks_found: networks.length, networks },
    };
  }

  private parseMacOS(output: string): Array<Record<string, unknown>> {
    const networks: Array<Record<string, unknown>> = [];
    const lines = output.split('\n').slice(1); // skip header
    for (const line of lines) {
      if (!line.trim()) continue;
      // airport -s format: SSID BSSID RSSI CHANNEL HT CC SECURITY
      const m = line.match(/^\s*(.+?)\s+([0-9a-f:]{17})\s+(-?\d+)\s+(\S+)\s+\S+\s+\S+\s+(.+)$/i);
      if (m) {
        networks.push({
          ssid: m[1].trim(),
          bssid: m[2],
          rssi: Number(m[3]),
          channel: m[4],
          security: m[5].trim(),
        });
      }
    }
    return networks;
  }

  private parseLinux(output: string): Array<Record<string, unknown>> {
    const networks: Array<Record<string, unknown>> = [];
    // nmcli format or iwlist format
    if (output.includes('SSID')) {
      for (const line of output.split('\n').slice(1)) {
        const parts = line.trim().split(/\s{2,}/);
        if (parts.length >= 4) {
          networks.push({ ssid: parts[1] ?? parts[0], signal: parts[parts.length - 2], security: parts[parts.length - 1] });
        }
      }
    }
    return networks;
  }

  private parseWindows(output: string): Array<Record<string, unknown>> {
    const networks: Array<Record<string, unknown>> = [];
    let current: Record<string, unknown> = {};
    for (const line of output.split('\n')) {
      const kv = line.match(/^\s*(.+?)\s*:\s*(.+)/);
      if (!kv) continue;
      const [, key, val] = kv;
      if (/SSID(?!\s*\d)/i.test(key)) { if (current.ssid) networks.push(current); current = { ssid: val.trim() }; }
      else if (/Authentication|认证/i.test(key)) current.security = val.trim();
      else if (/Signal|信号/i.test(key)) current.signal = val.trim();
    }
    if (current.ssid) networks.push(current);
    return networks;
  }

  private exec(cmd: string, args: string[], timeoutSec: number): Promise<{ stdout: string; error?: string }> {
    return new Promise((resolve) => {
      const child = spawn(cmd, args, { shell: false, windowsHide: true });
      let stdout = '';
      let done = false;

      child.stdout.setEncoding('utf8');
      child.stdout.on('data', (c) => { stdout += c; });

      const timer = setTimeout(() => { if (done) return; done = true; child.kill('SIGTERM'); resolve({ stdout, error: `超时` }); }, timeoutSec * 1000);
      child.on('error', (err) => { if (done) return; done = true; clearTimeout(timer); resolve({ stdout, error: /ENOENT/.test(err.message) ? `${cmd} 不可用` : err.message }); });
      child.on('close', () => { if (done) return; done = true; clearTimeout(timer); resolve({ stdout }); });
    });
  }
}
