#!/usr/bin/env node
/**
 * 全局安装 / npm pack 后的单入口：先起 Nest 后端，再启动 terminal-ui（Ink TUI）。
 * 仓库开发时仍可用 npm run start:stack。
 */
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const PACKAGE_ROOT = path.resolve(__dirname, '..');
const TUI_CLI = path.join(PACKAGE_ROOT, 'terminal-ui', 'dist', 'cli.js');
const BACKEND_ENTRY = path.join(PACKAGE_ROOT, 'server', 'dist', 'main.js');

function log(message) {
  // eslint-disable-next-line no-console
  console.log(`[secbot] ${message}`);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function checkBackend(baseUrl, timeoutMs = 1500) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${baseUrl}/health`, {
      method: 'GET',
      signal: controller.signal,
    });
    if (!res.ok) return false;
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function waitBackendReady(baseUrl, totalMs = 25000) {
  const started = Date.now();
  while (Date.now() - started < totalMs) {
    if (await checkBackend(baseUrl, 1200)) return true;
    await sleep(500);
  }
  return false;
}

async function stopProcess(proc) {
  if (!proc || proc.exitCode !== null) return;

  proc.kill('SIGTERM');
  const exited = await Promise.race([
    new Promise((resolve) => proc.once('exit', () => resolve(true))),
    sleep(3500).then(() => false),
  ]);
  if (!exited && proc.exitCode === null) {
    proc.kill('SIGKILL');
    await Promise.race([
      new Promise((resolve) => proc.once('exit', () => resolve(true))),
      sleep(2000).then(() => false),
    ]);
  }
}

function launchTuiInNewWindowsConsole(baseUrl) {
  const batPath = path.join(os.tmpdir(), `secbot-tui-${process.pid}-${Date.now()}.bat`);
  const safeUrl = baseUrl.replace(/"/g, '').replace(/\r?\n/g, '');
  const safeRoot = PACKAGE_ROOT.replace(/"/g, '""');
  const safeCli = TUI_CLI.replace(/"/g, '""');
  const body = [
    '@echo off',
    `set "SECBOT_API_URL=${safeUrl}"`,
    `set "SECBOT_PACKAGE_ROOT=${PACKAGE_ROOT}"`,
    `cd /d "${safeRoot}"`,
    `node "${safeCli}"`,
  ].join('\r\n');
  fs.writeFileSync(batPath, `${body}\r\n`, 'utf8');

  const child = spawn('cmd.exe', ['/c', 'start', 'Secbot', batPath], {
    cwd: PACKAGE_ROOT,
    stdio: 'ignore',
    windowsHide: false,
    detached: true,
  });
  child.unref();
}

async function start() {
  if (!fs.existsSync(BACKEND_ENTRY)) {
    // eslint-disable-next-line no-console
    console.error('[secbot] Missing server build. Reinstall @opensec/secbot.');
    process.exit(1);
  }
  if (!fs.existsSync(TUI_CLI)) {
    // eslint-disable-next-line no-console
    console.error('[secbot] Missing TUI build. Reinstall @opensec/secbot.');
    process.exit(1);
  }

  const port = String(process.env.PORT || 8000);
  const baseUrl = process.env.SECBOT_API_URL || `http://127.0.0.1:${port}`;
  const tuiEnv = {
    ...process.env,
    SECBOT_API_URL: baseUrl,
    SECBOT_PACKAGE_ROOT: PACKAGE_ROOT,
  };

  const hasTTY = Boolean(process.stdin.isTTY && process.stdout.isTTY);

  let backendProc = null;
  let startedBackend = false;

  if (!(await checkBackend(baseUrl, 1200))) {
    log(`Starting backend on ${baseUrl}`);
    backendProc = spawn(process.execPath, [BACKEND_ENTRY], {
      cwd: PACKAGE_ROOT,
      env: {
        ...process.env,
        PORT: port,
      },
      stdio: 'inherit',
      shell: false,
      windowsHide: true,
    });
    startedBackend = true;

    const ready = await waitBackendReady(baseUrl, 25000);
    if (!ready) {
      await stopProcess(backendProc);
      throw new Error(`Backend did not become ready at ${baseUrl}`);
    }
  } else {
    log(`Using existing backend at ${baseUrl}`);
  }

  const shutdown = async () => {
    if (startedBackend) {
      await stopProcess(backendProc);
    }
  };

  let tuiProc = null;
  let tuiInSameTerminal = true;

  if (!hasTTY && process.platform === 'win32') {
    log('No TTY in this terminal; opening the TUI in a new console window.');
    launchTuiInNewWindowsConsole(baseUrl);
    log('Backend keeps running in this window. Press Ctrl+C to stop the backend.');
    tuiInSameTerminal = false;
  } else if (!hasTTY) {
    // eslint-disable-next-line no-console
    console.error(
      '[secbot] No TTY. Open a system terminal (cmd/PowerShell/iTerm) and run `secbot` again.',
    );
    await shutdown();
    process.exit(1);
  } else {
    log('Starting TUI...');
    tuiProc = spawn(process.execPath, [TUI_CLI], {
      cwd: PACKAGE_ROOT,
      env: tuiEnv,
      stdio: 'inherit',
      windowsHide: true,
    });
  }

  const onSignal = async (signal, exitCode) => {
    try {
      if (tuiInSameTerminal && tuiProc && tuiProc.exitCode === null) {
        tuiProc.kill(signal);
      }
      await shutdown();
    } finally {
      process.exit(exitCode);
    }
  };

  process.on('SIGINT', () => {
    onSignal('SIGINT', 130).catch(() => process.exit(130));
  });

  process.on('SIGTERM', () => {
    onSignal('SIGTERM', 143).catch(() => process.exit(143));
  });

  if (!tuiInSameTerminal) {
    await new Promise(() => {});
    return;
  }

  const tuiCode = await new Promise((resolve, reject) => {
    tuiProc.once('error', reject);
    tuiProc.once('close', (code) => resolve(code ?? 0));
  });

  await shutdown();
  process.exit(tuiCode);
}

module.exports = { start };

if (require.main === module) {
  start().catch((error) => {
    // eslint-disable-next-line no-console
    console.error(`[secbot] ${error.message}`);
    process.exit(1);
  });
}
