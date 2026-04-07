#!/usr/bin/env node
/**
 * CLI entry: requires a real TTY; uses alternate screen when supported.
 * 启动方式：远程 API/SSE（已有后端）或在本机 spawn 后端子进程。
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline/promises';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
import React from 'react';
import { render } from 'ink';
import { getBaseUrl, checkBackend } from './config.js';
import { getBackendMainPath, spawnBackendChild } from './backendSpawn.js';
import { AllProviders } from './contexts/index.js';
import { App } from './App.js';

type BackendConnectionMode = 'auto' | 'remote' | 'spawn';

/** 由 resolveBackendConnection 填充；异常退出时用于停止子进程后端 */
let stopSpawnedBackend: (() => Promise<void>) | null = null;

function parseBackendCli(): {
  mode: BackendConnectionMode;
  apiUrl?: string;
} {
  const argv = process.argv.slice(2);
  let mode: BackendConnectionMode = 'auto';
  let apiUrl: string | undefined;

  const env = process.env.SECBOT_TUI_BACKEND?.toLowerCase();
  if (env === 'remote' || env === 'spawn') {
    mode = env;
  }

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--remote' || a === '-r') mode = 'remote';
    else if (a === '--spawn-backend' || a === '--spawn' || a === '-s')
      mode = 'spawn';
    else if (a.startsWith('--backend-url='))
      apiUrl = a.slice('--backend-url='.length);
    else if (a === '--backend-url' && argv[i + 1]) apiUrl = argv[++i];
  }

  return { mode, apiUrl };
}

/**
 * 返回需在退出时调用的 stop（若启动了子进程后端），否则 null。
 */
async function resolveBackendConnection(
  mode: BackendConnectionMode,
): Promise<(() => Promise<void>) | null> {
  let reachable = (await checkBackend()).ok;
  let effectiveMode = mode;

  if (mode === 'auto') {
    if (reachable) return null;
    if (process.stdin.isTTY && process.stdout.isTTY) {
      const rl = createInterface({
        input: process.stdin,
        output: process.stdout,
      });
      try {
        const base = getBaseUrl();
        const ans = await rl.question(
          `Secbot TUI — 未检测到后端（${base}）\n` +
            `[1] 远程连接已有后端（HTTP API / SSE），使用 SECBOT_API_URL 或 --backend-url\n` +
            `[2] 在本机启动后端子进程（需已在仓库根目录执行 npm run build）\n` +
            `请选择 [1/2]（默认 2）: `,
        );
        effectiveMode = ans.trim() === '1' ? 'remote' : 'spawn';
      } finally {
        rl.close();
      }
    } else {
      effectiveMode = fs.existsSync(getBackendMainPath()) ? 'spawn' : 'remote';
    }
  }

  reachable = (await checkBackend()).ok;
  if (reachable) return null;

  if (effectiveMode === 'remote') {
    throw new Error(
      `无法连接后端 ${getBaseUrl()}。请先启动后端、检查地址，或使用 --spawn-backend / SECBOT_TUI_BACKEND=spawn`,
    );
  }

  const { stop } = await spawnBackendChild();
  return stop;
}

async function cleanupSpawnedBackend(): Promise<void> {
  if (!stopSpawnedBackend) return;
  try {
    await stopSpawnedBackend();
  } catch {
    // ignore
  } finally {
    stopSpawnedBackend = null;
  }
}

const ALTERNATE_SCREEN_ON = '\x1b[?1049h';
const ALTERNATE_SCREEN_OFF = '\x1b[?1049l';
const ANSI_RESET = '\x1b[0m';

const TUI_ERROR_LOG = 'tui-error.log';
const TUI_LAUNCH_LOG = 'tui-launch.log';
const TUI_RUNTIME_LOG = process.env.SECBOT_TUI_RUNTIME_LOG;

function appendLogLine(target: string | undefined, line: string) {
  if (!target) return;
  try {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.appendFileSync(target, `${new Date().toISOString()} ${line}\n`);
  } catch {
    // ignore
  }
}

function leaveAlternateScreen() {
  try {
    process.stdout.write(ANSI_RESET);
    process.stdout.write(ALTERNATE_SCREEN_OFF);
  } catch {
    // ignore
  }
}

/** Append errors to terminal-ui/tui-error.log for debugging */
function writeErrorLog(message: string, detail?: unknown) {
  try {
    const logPath = path.join(process.cwd(), TUI_ERROR_LOG);
    const line = `${message}${detail != null ? ` ${String(detail)}` : ''}`;
    appendLogLine(logPath, line);
    appendLogLine(TUI_RUNTIME_LOG, `[error] ${line}`);
  } catch {
    // ignore
  }
}

/** Append launch diagnostics for TTY / environment issues */
function writeLaunchLog(line: string) {
  try {
    const logPath = path.join(process.cwd(), TUI_LAUNCH_LOG);
    appendLogLine(logPath, line);
    appendLogLine(TUI_RUNTIME_LOG, `[launch] ${line}`);
  } catch {
    // ignore
  }
}

/**
 * On Windows without TTY: open a new console running this CLI from the package root
 * (supports global install where `npm run tui` is unavailable).
 */
function relaunchInNewWindow(): boolean {
  if (process.platform !== 'win32') return false;
  try {
    const pkgRoot = process.env.SECBOT_PACKAGE_ROOT || path.resolve(__dirname, '..', '..');
    const cliPath = path.join(__dirname, 'cli.js');
    const apiUrl = process.env.SECBOT_API_URL ?? '';
    const safeRoot = pkgRoot.replace(/"/g, '""');
    const safeCli = cliPath.replace(/"/g, '""');
    const safeApi = apiUrl.replace(/"/g, '""');
    const inner = `cd /d "${safeRoot}" && set "SECBOT_API_URL=${safeApi}" && set "SECBOT_PACKAGE_ROOT=${safeRoot}" && node "${safeCli}"`;
    const child = spawn('cmd', ['/c', 'start', 'SECBOT TUI', 'cmd', '/k', inner], {
      env: { ...process.env },
      stdio: 'ignore',
      windowsHide: false,
    });
    child.unref();
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const { mode: backendMode, apiUrl } = parseBackendCli();
  if (apiUrl) {
    process.env.SECBOT_API_URL = apiUrl;
  }

  const isTTY = !!process.stdin.isTTY;
  writeLaunchLog(`stdin.isTTY=${process.stdin.isTTY} stdout.isTTY=${process.stdout.isTTY} cwd=${process.cwd()}`);

  if (!isTTY) {
    if (relaunchInNewWindow()) {
      process.exit(0);
    }
    const msg =
      'Not a TTY. Ink requires a real terminal. From the repo: npm run start:stack. ' +
      'From npm: run `secbot` (Windows may open a new console).';
    writeErrorLog('NO_TTY', msg);
    console.error(msg);
    console.error('Or from repo root: npm run start:stack (starts backend then TUI).');
    process.exit(1);
  }

  try {
    const stop = await resolveBackendConnection(backendMode);
    stopSpawnedBackend = stop;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    writeErrorLog('BACKEND_SETUP_FAILED', msg);
    console.error(msg);
    process.exit(1);
  }

  const backend = await checkBackend();
  if (!backend.ok) {
    const err = backend.error ?? 'unknown';
    writeErrorLog('BACKEND_UNREACHABLE', `${getBaseUrl()} ${err}`);
    await cleanupSpawnedBackend();
    console.error('Cannot reach backend. Start it first: npm run start');
    console.error('URL: ' + getBaseUrl());
    console.error('Error: ' + err);
    process.exit(1);
  }

  process.stdout.write(ALTERNATE_SCREEN_ON);
  writeLaunchLog(`alternate-screen enabled columns=${process.stdout.columns ?? 'unknown'} rows=${process.stdout.rows ?? 'unknown'}`);
  process.on('exit', leaveAlternateScreen);

  const columns = (process.stdout as NodeJS.WriteStream & { columns?: number }).columns ?? 100;
  const rows = (process.stdout as NodeJS.WriteStream & { rows?: number }).rows ?? 32;
  const handleExit = (code?: number) => {
    void cleanupSpawnedBackend()
      .catch(() => {})
      .finally(() => {
        leaveAlternateScreen();
        process.exit(code ?? 0);
      });
  };

  try {
    const instance = render(
      <AllProviders onExit={handleExit}>
        <App columns={columns} rows={rows} />
      </AllProviders>,
      { exitOnCtrlC: false }
    );
    instance.waitUntilExit().then((code) => {
      handleExit(code ?? 0);
    }).catch(() => {
      handleExit(1);
    });
  } catch (err) {
    void cleanupSpawnedBackend()
      .catch(() => {})
      .finally(() => {
        leaveAlternateScreen();
        const msg = err instanceof Error ? err.message : String(err);
        writeErrorLog('RENDER_ERROR', err);
        if (/raw mode|isRawModeSupported|stdin/.test(msg)) {
          console.error('Terminal does not support raw mode. Use CMD or PowerShell outside the IDE.');
        } else {
          console.error('Failed to start TUI:', msg);
        }
        console.error('Details written to ' + path.join(process.cwd(), TUI_ERROR_LOG));
        process.exit(1);
      });
  }
}

process.on('uncaughtException', (err) => {
  writeErrorLog('uncaughtException', err?.stack ?? err);
  void cleanupSpawnedBackend()
    .catch(() => {})
    .finally(() => {
      leaveAlternateScreen();
      console.error(err);
      process.exit(1);
    });
});

process.on('unhandledRejection', (reason) => {
  writeErrorLog('unhandledRejection', String(reason));
  void cleanupSpawnedBackend()
    .catch(() => {})
    .finally(() => {
      leaveAlternateScreen();
      console.error('Unhandled rejection:', reason);
      process.exit(1);
    });
});

main();
