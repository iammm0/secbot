/**
 * 在 TUI 进程内启动本地 Nest 后端子进程，并等待 /api/system/info 可用。
 */
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export function resolvePackageRoot(): string {
  return process.env.SECBOT_PACKAGE_ROOT ?? path.resolve(__dirname, '..', '..');
}

export function getBackendMainPath(): string {
  return path.join(resolvePackageRoot(), 'server', 'dist', 'main.js');
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parsePort(raw: string): number {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1 || n > 65535) {
    throw new Error(`无效端口: ${raw}`);
  }
  return n;
}

function canBindPort(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.once('error', () => resolve(false));
    server.listen(port, '127.0.0.1', () => {
      server.close(() => resolve(true));
    });
  });
}

function allocateEphemeralPort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (!addr || typeof addr !== 'object') {
        server.close(() => reject(new Error('无法分配可用端口')));
        return;
      }
      const { port } = addr;
      server.close((err) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(port);
      });
    });
  });
}

async function resolveSpawnPort(): Promise<string> {
  const explicitPort = process.env.PORT?.trim();
  if (explicitPort) {
    return String(parsePort(explicitPort));
  }

  const preferredPort = 8000;
  if (await canBindPort(preferredPort)) {
    return String(preferredPort);
  }

  return String(await allocateEphemeralPort());
}

async function probeSystemInfo(
  baseUrl: string,
  timeoutMs: number,
): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${baseUrl}/api/system/info`, {
      signal: controller.signal,
    });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

export async function waitForBackendReady(
  baseUrl: string,
  totalMs = 25000,
): Promise<boolean> {
  const started = Date.now();
  while (Date.now() - started < totalMs) {
    if (await probeSystemInfo(baseUrl, 1200)) return true;
    await sleep(500);
  }
  return false;
}

async function stopProcess(proc: ChildProcess): Promise<void> {
  if (!proc || proc.exitCode !== null) return;
  proc.kill('SIGTERM');
  const exited = await Promise.race([
    new Promise<boolean>((resolve) => {
      proc.once('exit', () => resolve(true));
    }),
    sleep(3500).then(() => false),
  ]);
  if (!exited && proc.exitCode === null) {
    proc.kill('SIGKILL');
    await Promise.race([
      new Promise<boolean>((resolve) => {
        proc.once('exit', () => resolve(true));
      }),
      sleep(2000).then(() => false),
    ]);
  }
}

export interface SpawnedBackend {
  baseUrl: string;
  stop: () => Promise<void>;
}

/**
 * 启动 server/dist/main.js，将 SECBOT_API_URL、PORT 写回 process.env。
 */
export async function spawnBackendChild(): Promise<SpawnedBackend> {
  const pkgRoot = resolvePackageRoot();
  const entry = getBackendMainPath();
  if (!fs.existsSync(entry)) {
    throw new Error(
      `未找到后端构建: ${entry}\n请先在仓库根目录执行 npm run build`,
    );
  }

  const port = await resolveSpawnPort();
  const baseUrl = `http://127.0.0.1:${port}`;

  const child = spawn(process.execPath, [entry], {
    cwd: pkgRoot,
    env: {
      ...process.env,
      PORT: port,
    },
    stdio: 'inherit',
    shell: false,
    windowsHide: true,
  });

  const ready = await waitForBackendReady(baseUrl, 25000);
  if (!ready) {
    await stopProcess(child);
    throw new Error(`后端在 ${baseUrl} 启动超时（请检查端口占用或构建是否完整）`);
  }

  process.env.PORT = port;
  process.env.SECBOT_API_URL = baseUrl;

  return {
    baseUrl,
    stop: () => stopProcess(child),
  };
}
