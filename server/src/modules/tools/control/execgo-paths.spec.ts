import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  resolveExecGoCliPath,
  resolveExecGoRuntimePath,
  resolveExecGoServerPath,
  resolveSiblingExecGoRoot,
  resolveSiblingExecGoRuntimeRoot,
} from './execgo-paths';

describe('execgo paths resolution', () => {
  let tempBinDir: string;

  beforeEach(() => {
    tempBinDir = join(
      tmpdir(),
      `secbot-execgo-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    mkdirSync(tempBinDir, { recursive: true });
  });

  afterEach(() => {
    delete process.env.EXECGO_BIN_DIR;
    delete process.env.EXECGO_EXECGOCLI;
    delete process.env.EXECGO_SERVER_BIN;
    delete process.env.EXECGO_RUNTIME_BIN;
    try {
      rmSync(tempBinDir, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  it('locates the internal runtime source roots', () => {
    const goRoot = resolveSiblingExecGoRoot();
    expect(goRoot).not.toBeNull();
    expect(goRoot!).toMatch(/runtime[/\\]execgo$/);

    const rustRoot = resolveSiblingExecGoRuntimeRoot();
    expect(rustRoot).not.toBeNull();
    expect(rustRoot!).toMatch(/runtime[/\\]execgo-runtime$/);
  });

  it('locates binaries when EXECGO_BIN_DIR contains them', () => {
    writeFileSync(join(tempBinDir, 'execgo'), '');
    writeFileSync(join(tempBinDir, 'execgocli'), '');
    writeFileSync(join(tempBinDir, 'execgo-runtime'), '');
    process.env.EXECGO_BIN_DIR = tempBinDir;

    const cliPath = resolveExecGoCliPath();
    expect(cliPath).toBe(join(tempBinDir, 'execgocli'));

    const serverPath = resolveExecGoServerPath();
    expect(serverPath).toBe(join(tempBinDir, 'execgo'));

    const runtimePath = resolveExecGoRuntimePath();
    expect(runtimePath).toBe(join(tempBinDir, 'execgo-runtime'));
  });

  it('respects explicit environment variable overrides', () => {
    process.env.EXECGO_EXECGOCLI = 'custom-execgocli-path';
    expect(resolveExecGoCliPath()).toBe('custom-execgocli-path');

    const customServer = join(tempBinDir, 'my-custom-server');
    writeFileSync(customServer, '');
    process.env.EXECGO_SERVER_BIN = customServer;
    expect(resolveExecGoServerPath()).toBe(customServer);

    const customRuntime = join(tempBinDir, 'my-custom-runtime');
    writeFileSync(customRuntime, '');
    process.env.EXECGO_RUNTIME_BIN = customRuntime;
    expect(resolveExecGoRuntimePath()).toBe(customRuntime);
  });

  it('falls back safely when binaries are not built or installed', () => {
    const cliPath = resolveExecGoCliPath('execgocli');
    expect(cliPath).toMatch(/execgocli(\.exe)?$/);

    const serverPath = resolveExecGoServerPath();
    if (serverPath !== null) {
      expect(serverPath).toMatch(/execgo(\.exe)?$/);
    }

    const runtimePath = resolveExecGoRuntimePath();
    if (runtimePath !== null) {
      expect(runtimePath).toMatch(/execgo-runtime(\.exe)?$/);
    }
  });
});
