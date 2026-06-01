import { spawn } from 'node:child_process';
import { platform } from 'node:os';
import { BaseTool, ToolResult } from '../core/base-tool';

/** 允许自动安装的安全工具白名单及其安装方式 */
const INSTALL_REGISTRY: Record<
  string,
  { brew?: string; apt?: string; go?: string; pip?: string; description: string }
> = {
  nuclei: {
    brew: 'nuclei',
    apt: 'nuclei',
    go: 'github.com/projectdiscovery/nuclei/v3/cmd/nuclei@latest',
    description: '模板漏洞扫描器',
  },
  nikto: { brew: 'nikto', apt: 'nikto', description: 'Web 综合漏扫' },
  nmap: { brew: 'nmap', apt: 'nmap', description: '端口扫描与服务识别' },
  ffuf: {
    brew: 'ffuf',
    apt: 'ffuf',
    go: 'github.com/ffuf/ffuf/v2@latest',
    description: '目录/参数爆破',
  },
  tshark: { brew: 'wireshark', apt: 'tshark', description: '网络抓包分析' },
  traceroute: { brew: 'traceroute', apt: 'traceroute', description: '路由追踪' },
  sqlmap: { brew: 'sqlmap', apt: 'sqlmap', pip: 'sqlmap', description: 'SQL 注入自动化' },
  hydra: { brew: 'hydra', apt: 'hydra', description: '多协议暴力破解' },
  subfinder: {
    brew: 'subfinder',
    go: 'github.com/projectdiscovery/subfinder/v2/cmd/subfinder@latest',
    description: '子域名发现',
  },
  httpx: {
    brew: 'httpx',
    go: 'github.com/projectdiscovery/httpx/cmd/httpx@latest',
    description: 'HTTP 探测',
  },
  gobuster: {
    brew: 'gobuster',
    go: 'github.com/OJ/gobuster/v3@latest',
    description: '目录/DNS 爆破',
  },
  amass: {
    brew: 'amass',
    go: 'github.com/owasp-amass/amass/v4/...@master',
    description: '攻击面枚举',
  },
  masscan: { brew: 'masscan', apt: 'masscan', description: '高速端口扫描' },
  whatweb: { brew: 'whatweb', apt: 'whatweb', description: 'Web 指纹识别' },
  wpscan: { brew: 'wpscan', description: 'WordPress 漏洞扫描' },
  testssl: { brew: 'testssl', description: 'SSL/TLS 深度检测' },
  feroxbuster: { brew: 'feroxbuster', description: '递归目录爆破' },
};

export class InstallToolTool extends BaseTool {
  constructor() {
    super('install_tool', '安装安全工具 — 自动检测包管理器并安装所需的安全测试工具');
  }

  async run(params: Record<string, unknown>): Promise<ToolResult> {
    const toolName = String(params.tool ?? params.name ?? '')
      .trim()
      .toLowerCase();
    if (!toolName) return { success: false, result: null, error: '缺少必要参数: tool (工具名称)' };

    const entry = INSTALL_REGISTRY[toolName];
    if (!entry) {
      return {
        success: false,
        result: null,
        error: `不支持自动安装: ${toolName}。支持的工具: ${Object.keys(INSTALL_REGISTRY).join(', ')}`,
      };
    }

    // Check if already installed
    const alreadyInstalled = await this.isInstalled(toolName);
    if (alreadyInstalled) {
      return {
        success: true,
        result: { tool: toolName, status: 'already_installed', message: `${toolName} 已安装` },
      };
    }

    // Determine install method
    const os = platform();
    const method = await this.pickMethod(os, entry);
    if (!method) {
      return {
        success: false,
        result: null,
        error: `无法确定 ${toolName} 的安装方式。请手动安装。`,
      };
    }

    // Execute install
    const result = await this.exec(method.cmd, method.args, 300);

    if (result.code !== 0) {
      return {
        success: false,
        result: { stdout: result.stdout.slice(-500), stderr: result.stderr.slice(-500) },
        error: `安装 ${toolName} 失败 (exit ${result.code}): ${result.stderr.slice(-200)}`,
      };
    }

    // Verify
    const verified = await this.isInstalled(toolName);

    return {
      success: true,
      result: {
        tool: toolName,
        method: `${method.cmd} ${method.args.join(' ')}`,
        status: verified ? 'installed' : 'install_completed_but_not_in_path',
        message: verified
          ? `${toolName} 安装成功`
          : `安装命令执行完毕，但 ${toolName} 未在 PATH 中找到`,
      },
    };
  }

  private async pickMethod(
    os: string,
    entry: { brew?: string; apt?: string; go?: string; pip?: string },
  ): Promise<{ cmd: string; args: string[] } | null> {
    if (os === 'darwin' && entry.brew) {
      if (await this.isInstalled('brew')) {
        return { cmd: 'brew', args: ['install', entry.brew] };
      }
    }

    if (os === 'linux') {
      if (entry.apt && (await this.isInstalled('apt-get'))) {
        return { cmd: 'sudo', args: ['apt-get', 'install', '-y', entry.apt] };
      }
      if (entry.brew && (await this.isInstalled('brew'))) {
        return { cmd: 'brew', args: ['install', entry.brew] };
      }
    }

    if (entry.go && (await this.isInstalled('go'))) {
      return { cmd: 'go', args: ['install', entry.go] };
    }

    if (entry.pip && (await this.isInstalled('pip3'))) {
      return { cmd: 'pip3', args: ['install', entry.pip] };
    }

    // Fallback: try brew on any platform
    if (entry.brew && (await this.isInstalled('brew'))) {
      return { cmd: 'brew', args: ['install', entry.brew] };
    }

    return null;
  }

  private isInstalled(cmd: string): Promise<boolean> {
    return new Promise((resolve) => {
      const child = spawn('which', [cmd], { shell: false });
      child.on('close', (code) => resolve(code === 0));
      child.on('error', () => resolve(false));
      child.stdout.resume();
      child.stderr.resume();
    });
  }

  private exec(
    cmd: string,
    args: string[],
    timeoutSec: number,
  ): Promise<{ code: number; stdout: string; stderr: string }> {
    return new Promise((resolve) => {
      const child = spawn(cmd, args, {
        shell: false,
        windowsHide: true,
        env: { ...process.env, HOMEBREW_NO_AUTO_UPDATE: '1' },
      });
      let stdout = '';
      let stderr = '';
      let done = false;

      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', (c) => {
        stdout += c;
      });
      child.stderr.on('data', (c) => {
        stderr += c;
      });

      const timer = setTimeout(() => {
        if (done) return;
        done = true;
        child.kill('SIGTERM');
        resolve({ code: -1, stdout, stderr });
      }, timeoutSec * 1000);
      child.on('error', (err) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve({ code: -1, stdout, stderr: err.message });
      });
      child.on('close', (code) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        resolve({ code: code ?? 0, stdout, stderr });
      });
    });
  }
}
