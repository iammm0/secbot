import { existsSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import { join } from 'node:path';

const SEP = platform() === 'win32' ? ';' : ':';

export function bundledToolsPlatformDir(): string {
  if (platform() === 'win32') return 'win-x64';
  if (platform() === 'darwin') return process.arch === 'arm64' ? 'macos-arm64' : 'macos-x64';
  return 'linux-x64';
}

/** 候选目录：环境变量、包根、cwd、常见安装旁路。 */
export function resolveBundledToolsDirs(): string[] {
  const platformDir = bundledToolsPlatformDir();
  const fromEnv = (process.env.SECBOT_TOOLS_DIR || '').trim();
  const packageRoot = (process.env.SECBOT_PACKAGE_ROOT || '').trim();
  const candidates = [
    fromEnv,
    packageRoot ? join(packageRoot, 'tools', platformDir) : '',
    packageRoot ? join(packageRoot, 'tools') : '',
    join(process.cwd(), 'tools', platformDir),
    join(process.cwd(), 'tools'),
    join(homedir(), '.secbot', 'tools', platformDir),
  ].filter(Boolean);
  const seen = new Set<string>();
  const out: string[] = [];
  for (const dir of candidates) {
    const key = dir.replace(/[\\/]+$/, '').toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    if (existsSync(dir)) out.push(dir);
  }
  return out;
}

/**
 * 把随包 tools 目录 prepend 到 process.env.PATH。
 * 应在 Nest 启动最早期调用，使后续 spawn(nmap/nuclei/…) 能找到二进制。
 */
export function applyBundledToolsPath(): string[] {
  const dirs = resolveBundledToolsDirs();
  if (dirs.length === 0) return [];
  const current = process.env.PATH || process.env.Path || '';
  const parts = current.split(SEP).filter(Boolean);
  const prepend = dirs.filter((dir) => !parts.some((p) => p.toLowerCase() === dir.toLowerCase()));
  if (prepend.length === 0) return dirs;
  const next = [...prepend, ...parts].join(SEP);
  process.env.PATH = next;
  if (platform() === 'win32') process.env.Path = next;
  if (!process.env.SECBOT_TOOLS_DIR) {
    process.env.SECBOT_TOOLS_DIR = prepend[0];
  }
  return dirs;
}
