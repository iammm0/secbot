export interface ExecGoRuntimeConfig {
  /** Use ExecGo as default command / action runtime */
  enabled: boolean;
  /** Audit every Secbot tool action via ExecGo (os.noop metadata) */
  auditActions: boolean;
  /** Fall back to local execution when ExecGo is unavailable */
  fallbackLocal: boolean;
  url: string;
  runtimeUrl: string;
  cliPath: string;
}

const DEFAULTS: ExecGoRuntimeConfig = {
  enabled: false,
  auditActions: true,
  fallbackLocal: true,
  url: 'http://127.0.0.1:8080',
  runtimeUrl: 'http://127.0.0.1:18080',
  cliPath: 'execgocli',
};

let cached: ExecGoRuntimeConfig | null = null;

export function defaultExecGoRuntimeConfig(): ExecGoRuntimeConfig {
  return {
    ...DEFAULTS,
    enabled: execGoEnvTruthy(process.env.SECBOT_EXECGO_ENABLED) || DEFAULTS.enabled,
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
