import { existsSync } from 'node:fs';
import { platform } from 'node:os';
import { join } from 'node:path';
import { commandExists } from '../../common/process/command-exists';
import {
  INSTALL_REGISTRY,
  InstallToolTool,
  manualInstallHint,
} from '../tools/control/install-tool.tool';
import { resolveBundledToolsDirs } from '../tools/control/bundled-tools-path';

export type RuntimeToolKind = 'required' | 'optional';

export interface RuntimeToolDefinition {
  id: string;
  description: string;
  kind: RuntimeToolKind;
}

/** 初始化时引导安装的本机程序。Windows 上 nikto 改为可选（依赖 Perl）。 */
const ALL_RUNTIME_TOOLS: RuntimeToolDefinition[] = [
  { id: 'nmap', description: '端口扫描与服务识别', kind: 'required' },
  { id: 'nuclei', description: '模板漏洞扫描', kind: 'required' },
  { id: 'ffuf', description: '目录与参数爆破', kind: 'required' },
  { id: 'nikto', description: 'Web 综合漏扫', kind: 'required' },
];

export function requiredRuntimeTools(): RuntimeToolDefinition[] {
  if (platform() === 'win32') {
    return ALL_RUNTIME_TOOLS.map((tool) =>
      tool.id === 'nikto' ? { ...tool, kind: 'optional' as const } : tool,
    );
  }
  return ALL_RUNTIME_TOOLS;
}

/** @deprecated 使用 requiredRuntimeTools()；保留常量兼容旧引用 */
export const REQUIRED_RUNTIME_TOOLS = ALL_RUNTIME_TOOLS;

export interface RuntimeToolStatus {
  id: string;
  description: string;
  installed: boolean;
  kind: RuntimeToolKind;
  bundled: boolean;
  manual_hint?: string;
}

export interface RuntimeEnvironmentReport {
  tools: RuntimeToolStatus[];
  missing: string[];
  ready: boolean;
  platform: string;
  tools_dirs: string[];
}

function isBundledPresent(toolId: string): boolean {
  const dirs = resolveBundledToolsDirs();
  if (dirs.length === 0) return false;
  const names = platform() === 'win32' ? [`${toolId}.exe`, toolId] : [toolId, `${toolId}.exe`];
  return dirs.some((dir) => names.some((name) => existsSync(join(dir, name))));
}

export async function probeRuntimeTools(): Promise<RuntimeEnvironmentReport> {
  const catalog = requiredRuntimeTools();
  const tools = await Promise.all(
    catalog.map(async (tool) => {
      const installed = await commandExists(tool.id);
      return {
        id: tool.id,
        description: tool.description,
        installed,
        kind: tool.kind,
        bundled: isBundledPresent(tool.id),
        manual_hint: platform() === 'win32' ? manualInstallHint(tool.id) : undefined,
      };
    }),
  );
  const missing = tools
    .filter((tool) => tool.kind === 'required' && !tool.installed)
    .map((tool) => tool.id);
  return {
    tools,
    missing,
    ready: missing.length === 0,
    platform: platform(),
    tools_dirs: resolveBundledToolsDirs(),
  };
}

export function isRequiredRuntimeTool(tool: string): boolean {
  return requiredRuntimeTools().some((item) => item.id === tool);
}

export function isInstallableRuntimeTool(tool: string): boolean {
  return Boolean(INSTALL_REGISTRY[tool.trim().toLowerCase()]);
}

export async function installRuntimeTool(tool: string) {
  return new InstallToolTool().run({ tool });
}
