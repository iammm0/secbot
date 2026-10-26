import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { platform } from 'node:os';
import { join } from 'node:path';

const isWin = platform() === 'win32';

/** 在 Windows 上除 PATH 外再检查的常见安装位置。 */
const WINDOWS_KNOWN_PATHS: Record<string, string[]> = {
  nmap: [
    join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Nmap', 'nmap.exe'),
    join(process.env.ProgramFiles || 'C:\\Program Files', 'Nmap', 'nmap.exe'),
  ],
};

export function windowsExecutableName(command: string): string {
  const base = command.trim();
  if (!base) return base;
  return /\.(exe|cmd|bat|ps1)$/i.test(base) ? base : `${base}.exe`;
}

export async function commandExists(command: string): Promise<boolean> {
  const name = command.trim();
  if (!name) return false;

  if (isWin) {
    for (const candidate of WINDOWS_KNOWN_PATHS[name] ?? []) {
      if (existsSync(candidate)) return true;
    }
  }

  const locator = isWin ? 'where' : 'which';
  const probe = isWin ? windowsExecutableName(name) : name;
  return await new Promise((resolve) => {
    const child = spawn(locator, [probe], { shell: false, windowsHide: true });
    child.on('close', (code) => resolve(code === 0));
    child.on('error', () => resolve(false));
    child.stdout?.resume();
    child.stderr?.resume();
  });
}

/** 若已安装，返回可执行路径（Windows `where` 的第一行）；否则 null。 */
export async function resolveCommandPath(command: string): Promise<string | null> {
  const name = command.trim();
  if (!name) return null;

  if (isWin) {
    for (const candidate of WINDOWS_KNOWN_PATHS[name] ?? []) {
      if (existsSync(candidate)) return candidate;
    }
  }

  const locator = isWin ? 'where' : 'which';
  const probe = isWin ? windowsExecutableName(name) : name;
  return await new Promise((resolve) => {
    const child = spawn(locator, [probe], { shell: false, windowsHide: true });
    let stdout = '';
    child.stdout?.setEncoding('utf8');
    child.stdout?.on('data', (chunk) => {
      stdout += chunk;
    });
    child.on('close', (code) => {
      if (code !== 0) {
        resolve(null);
        return;
      }
      const first = stdout
        .split(/\r?\n/)
        .map((line) => line.trim())
        .find(Boolean);
      resolve(first || null);
    });
    child.on('error', () => resolve(null));
    child.stderr?.resume();
  });
}
