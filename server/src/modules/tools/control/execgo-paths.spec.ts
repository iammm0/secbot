import { describe, expect, it } from 'vitest';
import {
  resolveExecGoCliPath,
  resolveExecGoRuntimePath,
  resolveExecGoServerPath,
  resolveSiblingExecGoRoot,
  resolveSiblingExecGoRuntimeRoot,
} from './execgo-paths';

describe('execgo paths resolution', () => {
  it('locates the internal runtime binaries in runtime/bin', () => {
    const cliPath = resolveExecGoCliPath();
    expect(cliPath).toContain('runtime');
    expect(cliPath).toMatch(/execgocli(\.exe)?$/);

    const serverPath = resolveExecGoServerPath();
    expect(serverPath).not.toBeNull();
    expect(serverPath!).toContain('runtime');
    expect(serverPath!).toMatch(/execgo(\.exe)?$/);

    const runtimePath = resolveExecGoRuntimePath();
    expect(runtimePath).not.toBeNull();
    expect(runtimePath!).toContain('runtime');
    expect(runtimePath!).toMatch(/execgo-runtime(\.exe)?$/);
  });

  it('locates the internal runtime source roots', () => {
    const goRoot = resolveSiblingExecGoRoot();
    expect(goRoot).not.toBeNull();
    expect(goRoot!).toMatch(/runtime[/\\]execgo$/);

    const rustRoot = resolveSiblingExecGoRuntimeRoot();
    expect(rustRoot).not.toBeNull();
    expect(rustRoot!).toMatch(/runtime[/\\]execgo-runtime$/);
  });

  it('respects environment variable overrides', () => {
    const orig = process.env.EXECGO_EXECGOCLI;
    try {
      process.env.EXECGO_EXECGOCLI = 'custom-execgocli-path';
      expect(resolveExecGoCliPath()).toBe('custom-execgocli-path');
    } finally {
      if (orig !== undefined) {
        process.env.EXECGO_EXECGOCLI = orig;
      } else {
        delete process.env.EXECGO_EXECGOCLI;
      }
    }
  });
});
