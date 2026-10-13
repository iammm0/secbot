import { spawn } from 'node:child_process';
import { platform } from 'node:os';
import { InstallToolTool } from '../tools/control/install-tool.tool';

/** 初始化时引导安装的本机程序。命令名与 PATH 中的可执行文件一致。 */
export const REQUIRED_RUNTIME_TOOLS = [
  { id: 'nmap', description: '端口扫描与服务识别' },
  { id: 'nuclei', description: '模板漏洞扫描' },
  { id: 'nikto', description: 'Web 综合漏扫' },
  { id: 'ffuf', description: '目录与参数爆破' },
] as const;

export interface RuntimeToolStatus {
  id: string;
  description: string;
  installed: boolean;
}

export interface RuntimeEnvironmentReport {
  tools: RuntimeToolStatus[];
  missing: string[];
  ready: boolean;
}

function commandExists(command: string): Promise<boolean> {
  const locator = platform() === 'win32' ? 'where' : 'which';
  return new Promise((resolve) => {
    const child = spawn(locator, [command], { shell: false, windowsHide: true });
    child.on('close', (code) => resolve(code === 0));
    child.on('error', () => resolve(false));
    child.stdout?.resume();
    child.stderr?.resume();
  });
}

export async function probeRuntimeTools(): Promise<RuntimeEnvironmentReport> {
  const tools = await Promise.all(
    REQUIRED_RUNTIME_TOOLS.map(async (tool) => ({
      id: tool.id,
      description: tool.description,
      installed: await commandExists(tool.id),
    })),
  );
  const missing = tools.filter((tool) => !tool.installed).map((tool) => tool.id);
  return { tools, missing, ready: missing.length === 0 };
}

export function isRequiredRuntimeTool(tool: string): boolean {
  return REQUIRED_RUNTIME_TOOLS.some((item) => item.id === tool);
}

export async function installRuntimeTool(tool: string) {
  return new InstallToolTool().run({ tool });
}
