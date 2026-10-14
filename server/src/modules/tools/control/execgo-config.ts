export type ExecGoSandboxProfile = 'process' | 'isolated';

export interface ExecGoRuntimeConfig {
  /** Use ExecGo as default command / action runtime */
  enabled: boolean;
  /** Audit every Secbot tool action via ExecGo (os.noop metadata) */
  auditActions: boolean;
  /** Fall back to local execution when ExecGo is unavailable */
  fallbackLocal: boolean;
  /** process keeps the runtime sandbox disabled; isolated asks for linux_sandbox */
  sandboxProfile: ExecGoSandboxProfile;
  url: string;
  runtimeUrl: string;
  cliPath: string;
}

const DEFAULTS: ExecGoRuntimeConfig = {
  enabled: false,
  auditActions: true,
  fallbackLocal: true,
  sandboxProfile: 'process',
  url: 'http://127.0.0.1:8080',
  runtimeUrl: 'http://127.0.0.1:18080',
  cliPath: 'execgocli',
};

export function normalizeSandboxProfile(value: unknown): ExecGoSandboxProfile {
  return value === 'isolated' ? 'isolated' : 'process';
}

export function localFallbackAllowed(
  config: ExecGoRuntimeConfig = getExecGoRuntimeConfig(),
): boolean {
  if (config.sandboxProfile === 'isolated') return false;
  return config.fallbackLocal;
}

export function execGoRuntimeServeArgs(
  profile: ExecGoSandboxProfile,
  addr: string,
  dataDir: string,
): string[] {
  const args = ['serve', '--listen-addr', addr, '--data-dir', dataDir];
  if (profile !== 'isolated') {
    args.push('--disable-linux-sandbox', '--disable-cgroup');
  }
  return args;
}

export function isolatedRuntimeCommandFields(
  config: ExecGoRuntimeConfig = getExecGoRuntimeConfig(),
): Record<string, unknown> {
  if (config.sandboxProfile !== 'isolated') return {};
  return {
    sandbox: {
      profile: 'linux_sandbox',
      namespaces: { mount: true, pid: true, uts: true, ipc: true, net: false },
    },
    control_context: { requires_strict_sandbox: true },
  };
}

export interface ExecGoSandboxStatus {
  requested: 'off' | ExecGoSandboxProfile;
  reported: 'off' | ExecGoSandboxProfile;
  label: string;
  detail: string;
  os: string | null;
  linux_sandbox: boolean | null;
  cgroup_v2: boolean | null;
  overrides: Record<string, string>;
}

export function describeExecGoSandbox(
  config: Pick<ExecGoRuntimeConfig, 'enabled' | 'sandboxProfile'>,
  capabilities: unknown,
): ExecGoSandboxStatus {
  const snapshot = readCapabilitySnapshot(capabilities);
  if (!config.enabled) {
    return {
      requested: 'off',
      reported: 'off',
      label: 'ExecGo off',
      detail: '未启用',
      ...snapshot,
    };
  }
  const isolated = config.sandboxProfile === 'isolated' && snapshot.linux_sandbox === true;
  if (isolated) {
    return {
      requested: 'isolated',
      reported: 'isolated',
      label: 'ExecGo isolated',
      detail: 'runtime 回包确认 Linux namespace 可用',
      ...snapshot,
    };
  }
  const detail =
    config.sandboxProfile === 'isolated'
      ? '进程隔离（当前 runtime 没有 Linux namespace）'
      : '进程隔离';
  return {
    requested: config.sandboxProfile,
    reported: 'process',
    label: 'ExecGo process',
    detail,
    ...snapshot,
  };
}

function readCapabilitySnapshot(capabilities: unknown): {
  os: string | null;
  linux_sandbox: boolean | null;
  cgroup_v2: boolean | null;
  overrides: Record<string, string>;
} {
  const root = asRecord(capabilities);
  const sandbox = asRecord(root?.sandbox);
  const resources = asRecord(root?.resources);
  const platform = asRecord(root?.platform);
  const overrides = asRecord(root?.overrides) ?? {};
  return {
    os: typeof platform?.os === 'string' ? platform.os : null,
    linux_sandbox: typeof sandbox?.linux_sandbox === 'boolean' ? sandbox.linux_sandbox : null,
    cgroup_v2: typeof resources?.cgroup_v2 === 'boolean' ? resources.cgroup_v2 : null,
    overrides: Object.fromEntries(
      Object.entries(overrides).filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string',
      ),
    ),
  };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return null;
}

let cached: ExecGoRuntimeConfig | null = null;

export function defaultExecGoRuntimeConfig(): ExecGoRuntimeConfig {
  return {
    ...DEFAULTS,
    enabled: execGoEnvTruthy(process.env.SECBOT_EXECGO_ENABLED) || DEFAULTS.enabled,
    sandboxProfile: normalizeSandboxProfile(process.env.SECBOT_EXECGO_SANDBOX),
    url: (process.env.EXECGO_URL || DEFAULTS.url).trim(),
    runtimeUrl: (process.env.EXECGO_RUNTIME_URL || DEFAULTS.runtimeUrl).trim(),
    cliPath: (process.env.EXECGO_EXECGOCLI || DEFAULTS.cliPath).trim(),
  };
}

export function getExecGoRuntimeConfig(): ExecGoRuntimeConfig {
  return cached ? { ...cached } : defaultExecGoRuntimeConfig();
}

export function setExecGoRuntimeConfig(partial: Partial<ExecGoRuntimeConfig>): ExecGoRuntimeConfig {
  const next: ExecGoRuntimeConfig = {
    ...getExecGoRuntimeConfig(),
    ...partial,
  };
  next.url = next.url.trim() || DEFAULTS.url;
  next.runtimeUrl = next.runtimeUrl.trim() || DEFAULTS.runtimeUrl;
  next.cliPath = next.cliPath.trim() || DEFAULTS.cliPath;
  next.sandboxProfile = normalizeSandboxProfile(next.sandboxProfile);
  if (next.sandboxProfile === 'isolated') next.fallbackLocal = false;
  cached = next;
  applyExecGoEnv(next);
  return { ...next };
}

export function applyExecGoEnv(config: ExecGoRuntimeConfig): void {
  process.env.SECBOT_EXECGO_ENABLED = config.enabled ? '1' : '0';
  process.env.EXECGO_URL = config.url;
  process.env.EXECGO_RUNTIME_URL = config.runtimeUrl;
  process.env.EXECGO_EXECGOCLI = config.cliPath;
  if (config.enabled) {
    process.env.SECBOT_COMMAND_BACKEND = 'execgo';
  } else if (process.env.SECBOT_COMMAND_BACKEND === 'execgo') {
    delete process.env.SECBOT_COMMAND_BACKEND;
  }
}

function execGoEnvTruthy(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value !== 'string') return false;
  return ['1', 'true', 'yes', 'on', 'enabled'].includes(value.trim().toLowerCase());
}
