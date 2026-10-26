import { spawn } from 'node:child_process';
import { platform } from 'node:os';
import { commandExists } from '../../../common/process/command-exists';
import { BaseTool, ToolResult } from '../core/base-tool';

type InstallEntry = {
  brew?: string;
  apt?: string;
  go?: string;
  pip?: string;
  winget?: string;
  scoop?: string;
  description: string;
  /** Windows 上手动安装提示（包管理器不可用时） */
  windowsHint?: string;
};

/** 允许自动安装的安全工具白名单及其安装方式 */
export const INSTALL_REGISTRY: Record<string, InstallEntry> = {
  nuclei: {
    brew: 'nuclei',
    apt: 'nuclei',
    go: 'github.com/projectdiscovery/nuclei/v3/cmd/nuclei@latest',
    scoop: 'nuclei',
    description: '模板漏洞扫描器',
    windowsHint:
      'Windows 推荐使用随包 tools\\win-x64\\nuclei.exe；或 scoop install nuclei / go install github.com/projectdiscovery/nuclei/v3/cmd/nuclei@latest',
  },
  nikto: {
    brew: 'nikto',
    apt: 'nikto',
    description: 'Web 综合漏扫',
    windowsHint: 'nikto 依赖 Perl，Windows 上请改用 WSL，或跳过此项',
  },
  nmap: {
    brew: 'nmap',
    apt: 'nmap',
    winget: 'Insecure.Nmap',
    description: '端口扫描与服务识别',
    windowsHint:
      'winget install --id Insecure.Nmap -e --accept-package-agreements --accept-source-agreements',
  },
  ffuf: {
    brew: 'ffuf',
    apt: 'ffuf',
    go: 'github.com/ffuf/ffuf/v2@latest',
    scoop: 'ffuf',
    description: '目录/参数爆破',
    windowsHint:
      'Windows 推荐使用随包 tools\\win-x64\\ffuf.exe；或 scoop install ffuf / go install github.com/ffuf/ffuf/v2@latest',
  },
  tshark: { brew: 'wireshark', apt: 'tshark', description: '网络抓包分析' },
  traceroute: { brew: 'traceroute', apt: 'traceroute', description: '路由追踪' },
  sqlmap: { brew: 'sqlmap', apt: 'sqlmap', pip: 'sqlmap', description: 'SQL 注入自动化' },
  hydra: { brew: 'hydra', apt: 'hydra', description: '多协议暴力破解' },
  subfinder: {
    brew: 'subfinder',
    go: 'github.com/projectdiscovery/subfinder/v2/cmd/subfinder@latest',
    scoop: 'subfinder',
    description: '子域名发现',
  },
  httpx: {
    brew: 'httpx',
    go: 'github.com/projectdiscovery/httpx/cmd/httpx@latest',
    scoop: 'httpx',
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

export function manualInstallHint(toolName: string): string | undefined {
  return INSTALL_REGISTRY[toolName]?.windowsHint ?? INSTALL_REGISTRY[toolName]?.description;
}

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

    const alreadyInstalled = await commandExists(toolName);
    if (alreadyInstalled) {
      return {
        success: true,
        result: { tool: toolName, status: 'already_installed', message: `${toolName} 已安装` },
      };
    }

    const os = platform();
    const method = await this.pickMethod(os, entry);
    if (!method) {
      const hint = entry.windowsHint || '请手动安装后重试。';
      return {
        success: false,
        result: { tool: toolName, manual_hint: hint },
        error: `无法确定 ${toolName} 的安装方式。${hint}`,
      };
    }

    const result = await this.exec(method.cmd, method.args, 900);

    if (result.code !== 0) {
      const hint = entry.windowsHint ? ` 手动：${entry.windowsHint}` : '';
      return {
        success: false,
        result: {
          stdout: result.stdout.slice(-500),
          stderr: result.stderr.slice(-500),
          manual_hint: entry.windowsHint,
        },
        error: `安装 ${toolName} 失败 (exit ${result.code}): ${result.stderr.slice(-200)}${hint}`,
      };
    }

    const verified = await commandExists(toolName);

    return {
      success: true,
      result: {
        tool: toolName,
        method: `${method.cmd} ${method.args.join(' ')}`,
        status: verified ? 'installed' : 'install_completed_but_not_in_path',
        manual_hint: verified ? undefined : entry.windowsHint,
        message: verified
          ? `${toolName} 安装成功`
          : `安装命令执行完毕，但 ${toolName} 未在 PATH 中找到。新开一个终端或重启 Secbot 后再试。${
              entry.windowsHint ? ` ${entry.windowsHint}` : ''
            }`,
      },
    };
  }

  private async pickMethod(
    os: string,
    entry: InstallEntry,
  ): Promise<{ cmd: string; args: string[] } | null> {
    if (os === 'win32') {
      if (entry.winget && (await commandExists('winget'))) {
        return {
          cmd: 'winget',
          args: [
            'install',
            '--id',
            entry.winget,
            '-e',
            '--accept-package-agreements',
            '--accept-source-agreements',
          ],
        };
      }
      if (entry.scoop && (await commandExists('scoop'))) {
        return { cmd: 'scoop', args: ['install', entry.scoop] };
      }
      if (entry.go && (await commandExists('go'))) {
        return { cmd: 'go', args: ['install', entry.go] };
      }
      if (entry.pip && (await commandExists('pip'))) {
        return { cmd: 'pip', args: ['install', entry.pip] };
      }
      if (entry.pip && (await commandExists('pip3'))) {
        return { cmd: 'pip3', args: ['install', entry.pip] };
      }
      return null;
    }

    if (os === 'darwin' && entry.brew) {
      if (await commandExists('brew')) {
        return { cmd: 'brew', args: ['install', entry.brew] };
      }
    }

    if (os === 'linux') {
      if (entry.apt && (await commandExists('apt-get'))) {
        return { cmd: 'sudo', args: ['apt-get', 'install', '-y', entry.apt] };
      }
      if (entry.brew && (await commandExists('brew'))) {
        return { cmd: 'brew', args: ['install', entry.brew] };
      }
    }

    if (entry.go && (await commandExists('go'))) {
      return { cmd: 'go', args: ['install', entry.go] };
    }

    if (entry.pip && (await commandExists('pip3'))) {
      return { cmd: 'pip3', args: ['install', entry.pip] };
    }

    if (entry.brew && (await commandExists('brew'))) {
      return { cmd: 'brew', args: ['install', entry.brew] };
    }

    return null;
  }

  private exec(
    cmd: string,
    args: string[],
    timeoutSec: number,
  ): Promise<{ code: number; stdout: string; stderr: string }> {
    return new Promise((resolve) => {
      const child = spawn(cmd, args, {
        shell: platform() === 'win32',
        windowsHide: true,
        env: { ...process.env, HOMEBREW_NO_AUTO_UPDATE: '1' },
      });
      let stdout = '';
      let stderr = '';
      let done = false;

      child.stdout?.setEncoding('utf8');
      child.stderr?.setEncoding('utf8');
      child.stdout?.on('data', (c) => {
        stdout += c;
      });
      child.stderr?.on('data', (c) => {
        stderr += c;
      });

      const timer = setTimeout(() => {
        if (done) return;
        done = true;
        child.kill('SIGTERM');
        resolve({ code: -1, stdout, stderr: stderr || 'install timed out' });
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
