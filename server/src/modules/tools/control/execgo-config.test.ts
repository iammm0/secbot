import { describe, expect, it } from 'vitest';
import {
  describeExecGoSandbox,
  execGoRuntimeServeArgs,
  getExecGoRuntimeConfig,
  isolatedRuntimeCommandFields,
  localFallbackAllowed,
  setExecGoRuntimeConfig,
} from './execgo-config';

describe('execgo sandbox profile', () => {
  it('keeps linux sandbox flags off unless the profile is isolated', () => {
    const processArgs = execGoRuntimeServeArgs('process', '127.0.0.1:18080', '/tmp/runtime');
    const isolatedArgs = execGoRuntimeServeArgs('isolated', '127.0.0.1:18080', '/tmp/runtime');
    expect(processArgs).toContain('--disable-linux-sandbox');
    expect(processArgs).toContain('--disable-cgroup');
    expect(isolatedArgs).not.toContain('--disable-linux-sandbox');
    expect(isolatedArgs).not.toContain('--disable-cgroup');
  });

  it('refuses local fallback and attaches a strict sandbox when isolated', () => {
    const before = getExecGoRuntimeConfig();
    try {
      const next = setExecGoRuntimeConfig({
        enabled: true,
        sandboxProfile: 'isolated',
        fallbackLocal: true,
      });
      expect(next.fallbackLocal).toBe(false);
      expect(localFallbackAllowed()).toBe(false);
      expect(isolatedRuntimeCommandFields()).toMatchObject({
        sandbox: { profile: 'linux_sandbox' },
        control_context: { requires_strict_sandbox: true },
      });
    } finally {
      setExecGoRuntimeConfig(before);
    }
  });

  it('reports process isolation when the runtime has no linux namespace', () => {
    const status = describeExecGoSandbox(
      { enabled: true, sandboxProfile: 'isolated' },
      {
        platform: { os: 'darwin' },
        sandbox: { linux_sandbox: false },
        resources: { cgroup_v2: false },
      },
    );
    expect(status.label).toBe('ExecGo process');
    expect(status.reported).toBe('process');
    expect(status.detail).toContain('进程隔离');
    expect(status.detail).not.toContain('Level 2');
  });

  it('reports isolated only when the runtime capability says so', () => {
    const status = describeExecGoSandbox(
      { enabled: true, sandboxProfile: 'isolated' },
      {
        platform: { os: 'linux' },
        sandbox: { linux_sandbox: true },
        resources: { cgroup_v2: true },
      },
    );
    expect(status.label).toBe('ExecGo isolated');
    expect(status.linux_sandbox).toBe(true);
    expect(status.cgroup_v2).toBe(true);
  });
});
