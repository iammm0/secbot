import { spawn, type ChildProcess } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  unlinkSync,
  openSync,
  closeSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { Logger } from '@nestjs/common';
import { getExecGoRuntimeConfig } from './execgo-config.js';
import {
  resolveExecGoServerPath,
  resolveExecGoRuntimePath,
  resolveSiblingExecGoRoot,
  resolveSiblingExecGoRuntimeRoot,
} from './execgo-paths.js';

export type ManagedProcessStatus = {
  name: 'execgo' | 'execgo-runtime';
  running: boolean;
  managed: boolean;
  pid: number | null;
  binary: string | null;
  addr: string;
  logFile: string;
  error?: string;
};

function runDir(): string {
  const dir = join(homedir(), '.secbot', 'run');
  mkdirSync(dir, { recursive: true });
  return dir;
}

function dataDir(name: string): string {
  const dir = join(homedir(), '.secbot', 'data', name);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function pidPath(name: string): string {
  return join(runDir(), `${name}.pid`);
}

function logPath(name: string): string {
  return join(runDir(), `${name}.log`);
}

function metaPath(name: string): string {
  return join(runDir(), `${name}.meta.json`);
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readManagedPid(name: string): number | null {
  try {
    const raw = readFileSync(pidPath(name), 'utf8').trim();
    const pid = Number(raw);
    if (!Number.isFinite(pid) || pid <= 0) return null;
    if (!isAlive(pid)) {
      cleanupFiles(name);
      return null;
    }
    return pid;
  } catch {
    return null;
  }
}

function cleanupFiles(name: string): void {
  for (const file of [pidPath(name), metaPath(name)]) {
    try {
      unlinkSync(file);
    } catch {
      /* ignore */
    }
  }
}

function listenHostPort(url: string, fallbackPort: number): { host: string; port: number; addr: string } {
  try {
    const parsed = new URL(url.includes('://') ? url : `http://${url}`);
    const port = parsed.port ? Number(parsed.port) : fallbackPort;
    const host = parsed.hostname || '127.0.0.1';
    return { host, port, addr: `${host}:${port}` };
  } catch {
    return { host: '127.0.0.1', port: fallbackPort, addr: `127.0.0.1:${fallbackPort}` };
  }
}

async function waitForHttp(url: string, timeoutMs = 12_000): Promise<boolean> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(1500) });
      if (response.ok || response.status < 500) return true;
    } catch {
      /* retry */
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  return false;
}

/**
 * Manages local background processes for ExecGo control plane + optional runtime.
 * Only stops processes that Secbot itself started (tracked via ~/.secbot/run/*.pid).
 */
export class ExecGoProcessManager {
  private readonly logger = new Logger(ExecGoProcessManager.name);
  private children = new Map<string, ChildProcess>();

  status(): ManagedProcessStatus[] {
    const config = getExecGoRuntimeConfig();
    const control = listenHostPort(config.url, 8080);
    const runtime = listenHostPort(config.runtimeUrl, 18080);
    return [
      this.statusOne('execgo', resolveExecGoServerPath(), control.addr),
      this.statusOne('execgo-runtime', resolveExecGoRuntimePath(), runtime.addr),
    ];
  }

  async startManaged(): Promise<{
    started: ManagedProcessStatus[];
    errors: string[];
  }> {
    const config = getExecGoRuntimeConfig();
    const errors: string[] = [];
    const started: ManagedProcessStatus[] = [];

    const controlBin = resolveExecGoServerPath();
    if (!controlBin) {
      errors.push(
        `未找到 execgo 可执行文件。请先构建同级项目：cd ${resolveSiblingExecGoRoot() ?? '../execgo'} && go build -o execgo ./cmd/execgo`,
      );
    } else {
      try {
        const control = listenHostPort(config.url, 8080);
        await this.startOne({
          name: 'execgo',
          binary: controlBin,
          args: ['-addr', `:${control.port}`, '-data-dir', dataDir('execgo')],
          cwd: resolveSiblingExecGoRoot() ?? undefined,
          readyUrl: `${config.url.replace(/\/$/, '')}/health`,
          env: {
            EXECGO_ADDR: `:${control.port}`,
            EXECGO_DATA_DIR: dataDir('execgo'),
          },
        });
      } catch (error) {
        errors.push(`启动 execgo 失败: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    const runtimeBin = resolveExecGoRuntimePath();
    if (!runtimeBin) {
      errors.push(
        `未找到 execgo-runtime。可选：cd ${resolveSiblingExecGoRuntimeRoot() ?? '../execgo-runtime'} && cargo build --release`,
      );
    } else {
      try {
        const runtime = listenHostPort(config.runtimeUrl, 18080);
        await this.startOne({
          name: 'execgo-runtime',
          binary: runtimeBin,
          args: [
            'serve',
            '--listen-addr',
            runtime.addr,
            '--data-dir',
            dataDir('execgo-runtime'),
            '--disable-linux-sandbox',
            '--disable-cgroup',
          ],
          cwd: resolveSiblingExecGoRuntimeRoot() ?? undefined,
          readyUrl: `${config.runtimeUrl.replace(/\/$/, '')}/healthz`,
          env: {
            EXECGO_RUNTIME_URL: config.runtimeUrl,
          },
        });
      } catch (error) {
        errors.push(
          `启动 execgo-runtime 失败: ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }

    started.push(...this.status());
    return { started, errors };
  }

  async stopManaged(): Promise<{ stopped: string[]; errors: string[] }> {
    const stopped: string[] = [];
    const errors: string[] = [];
    for (const name of ['execgo-runtime', 'execgo'] as const) {
      try {
        const did = await this.stopOne(name);
        if (did) stopped.push(name);
      } catch (error) {
        errors.push(`停止 ${name} 失败: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    return { stopped, errors };
  }

  private statusOne(
    name: 'execgo' | 'execgo-runtime',
    binary: string | null,
    addr: string,
  ): ManagedProcessStatus {
    const pid = readManagedPid(name);
    return {
      name,
      running: pid != null,
      managed: pid != null,
      pid,
      binary,
      addr,
      logFile: logPath(name),
    };
  }

  private async startOne(opts: {
    name: 'execgo' | 'execgo-runtime';
    binary: string;
    args: string[];
    cwd?: string;
    readyUrl: string;
    env?: Record<string, string>;
  }): Promise<void> {
    const existing = readManagedPid(opts.name);
    if (existing) {
      this.logger.log(`${opts.name} already managed (pid=${existing})`);
      return;
    }

    // If something else already serves the endpoint, don't start a duplicate.
    if (await waitForHttp(opts.readyUrl, 1500)) {
      this.logger.log(`${opts.name} already reachable at ${opts.readyUrl}, skip spawn`);
      return;
    }

    const logFile = logPath(opts.name);
    const logFd = openSync(logFile, 'a');
    let child: ChildProcess;
    try {
      child = spawn(opts.binary, opts.args, {
        cwd: opts.cwd,
        detached: true,
        stdio: ['ignore', logFd, logFd],
        env: {
          ...process.env,
          ...opts.env,
        },
        windowsHide: true,
      });
    } finally {
      closeSync(logFd);
    }

    if (!child.pid) {
      throw new Error(`failed to spawn ${opts.name}`);
    }

    writeFileSync(pidPath(opts.name), String(child.pid), 'utf8');
    writeFileSync(
      metaPath(opts.name),
      JSON.stringify(
        {
          pid: child.pid,
          binary: opts.binary,
          args: opts.args,
          startedAt: new Date().toISOString(),
          managedBy: 'secbot',
        },
        null,
        2,
      ),
      'utf8',
    );

    child.unref();
    this.children.set(opts.name, child);
    this.logger.log(`started ${opts.name} pid=${child.pid} log=${logFile}`);

    const ready = await waitForHttp(opts.readyUrl, 15_000);
    if (!ready) {
      throw new Error(`${opts.name} started (pid=${child.pid}) but not ready at ${opts.readyUrl}`);
    }
  }

  private async stopOne(name: 'execgo' | 'execgo-runtime'): Promise<boolean> {
    const pid = readManagedPid(name);
    if (!pid) {
      cleanupFiles(name);
      return false;
    }

    this.logger.log(`stopping ${name} pid=${pid}`);
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      cleanupFiles(name);
      return true;
    }

    const deadline = Date.now() + 8_000;
    while (Date.now() < deadline) {
      if (!isAlive(pid)) break;
      await new Promise((r) => setTimeout(r, 200));
    }
    if (isAlive(pid)) {
      try {
        process.kill(pid, 'SIGKILL');
      } catch {
        /* ignore */
      }
    }

    cleanupFiles(name);
    this.children.delete(name);
    return true;
  }
}

export const execGoProcessManager = new ExecGoProcessManager();
