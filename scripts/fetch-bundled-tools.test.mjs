import { describe, expect, it } from 'vitest';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { extractArchive, inferLabel, SPEC } from './fetch-bundled-tools.mjs';

describe('fetch-bundled-tools', () => {
  it('defines valid specs for all supported target platforms', () => {
    for (const key of ['windows-x64', 'linux-x64', 'macos-arm64']) {
      const spec = SPEC[key];
      expect(spec).toBeDefined();
      expect(spec.dir).toBeTruthy();
      expect(spec.nuclei.bin).toBeTruthy();
      expect(spec.nuclei.match).toBeInstanceOf(RegExp);
      expect(spec.ffuf.bin).toBeTruthy();
      expect(spec.ffuf.match).toBeInstanceOf(RegExp);
    }
  });

  it('infers current platform label or throws on unsupported platform', () => {
    const label = inferLabel();
    expect(['windows-x64', 'linux-x64', 'macos-arm64']).toContain(label);
  });

  it('extractArchive decompresses .zip and .tar.gz archives cleanly', () => {
    const testDir = join(tmpdir(), `secbot-extract-test-${Date.now()}`);
    mkdirSync(testDir, { recursive: true });

    try {
      const srcDir = join(testDir, 'src');
      mkdirSync(srcDir, { recursive: true });
      writeFileSync(join(srcDir, 'payload.txt'), 'hello from bundle tool');

      // Test tar.gz
      const tarPath = join(testDir, 'sample.tar.gz');
      execFileSync('tar', ['-czf', tarPath, '-C', srcDir, 'payload.txt']);
      const outTar = join(testDir, 'out-tar');
      extractArchive(tarPath, outTar);
      expect(existsSync(join(outTar, 'payload.txt'))).toBe(true);
      expect(readFileSync(join(outTar, 'payload.txt'), 'utf8')).toBe('hello from bundle tool');

      // Test zip
      const zipPath = join(testDir, 'sample.zip');
      if (process.platform === 'win32') {
        execFileSync('tar', ['-a', '-cf', zipPath, '-C', srcDir, 'payload.txt']);
      } else {
        execFileSync('zip', ['-j', zipPath, join(srcDir, 'payload.txt')]);
      }
      const outZip = join(testDir, 'out-zip');
      extractArchive(zipPath, outZip);
      expect(existsSync(join(outZip, 'payload.txt'))).toBe(true);
      expect(readFileSync(join(outZip, 'payload.txt'), 'utf8')).toBe('hello from bundle tool');
    } finally {
      rmSync(testDir, { recursive: true, force: true });
    }
  });
});
