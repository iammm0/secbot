import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { applyBundledToolsPath, bundledToolsPlatformDir } from './bundled-tools-path';

describe('applyBundledToolsPath', () => {
  const prevPath = process.env.PATH;
  const prevTools = process.env.SECBOT_TOOLS_DIR;
  const prevCwd = process.cwd();
  let temp = '';

  afterEach(() => {
    process.env.PATH = prevPath;
    if (prevTools === undefined) delete process.env.SECBOT_TOOLS_DIR;
    else process.env.SECBOT_TOOLS_DIR = prevTools;
    process.chdir(prevCwd);
    if (temp) rmSync(temp, { recursive: true, force: true });
    temp = '';
  });

  it('prepends an existing tools directory to PATH', () => {
    temp = mkdtempSync(join(tmpdir(), 'secbot-tools-'));
    const toolsDir = join(temp, 'tools', bundledToolsPlatformDir());
    mkdirSync(toolsDir, { recursive: true });
    writeFileSync(join(toolsDir, 'marker'), '1');
    process.chdir(temp);
    delete process.env.SECBOT_TOOLS_DIR;
    const dirs = applyBundledToolsPath();
    expect(dirs.some((dir) => dir.includes('tools'))).toBe(true);
    expect((process.env.PATH || '').startsWith(dirs[0]!)).toBe(true);
  });
});
