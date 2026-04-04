#!/usr/bin/env node

'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const TUI_DIR = path.join(ROOT, 'terminal-ui');
const BACKEND_ENTRY = path.join(ROOT, 'server', 'dist', 'main.js');
const NPM_EXEC_PATH = process.env.npm_execpath || '';

function log(message) {
  // eslint-disable-next-line no-console
  console.log(`[start:stack] ${message}`);
}

function run(cmd, args, options = {}) {
  const {
    cwd = ROOT,
    stdio = 'inherit',
    env,
    shell = false,
  } = options;

  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd,
      stdio,
      shell,
      windowsHide: true,
      env: env ?? process.env,
    });
    child.once('error', reject);
    child.once('close', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`Command failed (${cmd} ${args.join(' ')}), exit=${code}`));
    });
  });
}

function npmInvocation(args) {
  if (NPM_EXEC_PATH && fs.existsSync(NPM_EXEC_PATH)) {
    return {
      cmd: process.execPath,
      argv: [NPM_EXEC_PATH, ...args],
      shell: false,
    };
  }
  if (process.platform === 'win32') {
    return {
      cmd: 'npm.cmd',
      argv: args,
      shell: false,
    };
  }
  return {
    cmd: 'npm',
    argv: args,
    shell: false,
  };
}

function runNpm(args, options = {}) {
  const inv = npmInvocation(args);
  return run(inv.cmd, inv.argv, {
    ...options,
    shell: inv.shell,
  });
}

/** 每次启动均编译后端，避免沿用旧的 server/dist */
async function buildBackendLatest() {
  log('Building TypeScript backend (latest sources)...');
  await runNpm(['run', 'build']);
}

async function ensureTuiDeps() {
  const nodeModulesDir = path.join(TUI_DIR, 'node_modules');
  if (fs.existsSync(nodeModulesDir)) return;
  log('terminal-ui dependencies missing, installing...');
  await runNpm(['install'], { cwd: TUI_DIR });
}

async function sleep(ms) {
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

/**
 * IDE 集成终端通常无真实 TTY，Ink 无法在同一进程内运行。在 Windows 上通过「新控制台窗口」启动 TUI。
 */
function launchTuiInNewWindowsConsole(baseUrl) {
  const batPath = path.join(os.tmpdir(), `secbot-tui-${process.pid}-${Date.now()}.bat`);
  const safeUrl = baseUrl.replace(/"/g, '').replace(/\r?\n/g, '');
  const safeDir = TUI_DIR.replace(/"/g, '""');
  const body = [
    '@echo off',
    `set "SECBOT_API_URL=${safeUrl}"`,
    `cd /d "${safeDir}"`,
    'call npm.cmd run tui',
  ].join('\r\n');
  fs.writeFileSync(batPath, `${body}\r\n`, 'utf8');

  const child = spawn('cmd.exe', ['/c', 'start', 'Secbot TUI', batPath], {
    cwd: ROOT,
    stdio: 'ignore',
    windowsHide: false,
    detached: true,
  });
  child.unref();
}

async function main() {
  const hasTTY = Boolean(process.stdin.isTTY && process.stdout.isTTY);

  await buildBackendLatest();
  await ensureTuiDeps();

  const port = String(process.env.PORT || 8000);
  const baseUrl = process.env.SECBOT_API_URL || `http://127.0.0.1:${port}`;
  const tuiEnv = {
    ...process.env,
    SECBOT_API_URL: baseUrl,
  };

  let backendProc = null;
  let startedBackend = false;

  if (!(await checkBackend(baseUrl, 1200))) {
    log(`Starting TS backend on ${baseUrl} ...`);
    backendProc = spawn(process.execPath, [BACKEND_ENTRY], {
      cwd: ROOT,
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
    log('当前无真实 TTY（常见于 Cursor/VS Code 集成终端），将在新控制台窗口中启动 TUI。');
    log('Starting terminal TUI in a new window...');
    launchTuiInNewWindowsConsole(baseUrl);
    log('TUI 已在新窗口启动；本终端将保持后端运行，按 Ctrl+C 可停止后端。');
    tuiInSameTerminal = false;
  } else if (!hasTTY) {
    log('当前终端无真实 TTY，无法在此进程内启动 Ink TUI。');
    log('请在系统终端中执行：npm run start:stack，或 Windows 下双击 scripts\\start-cli.bat');
    await shutdown();
    process.exit(1);
  } else {
    log('Starting terminal TUI...');
    const tuiNpm = npmInvocation(['run', 'tui']);
    tuiProc = spawn(tuiNpm.cmd, tuiNpm.argv, {
      cwd: TUI_DIR,
      env: tuiEnv,
      stdio: 'inherit',
      shell: tuiNpm.shell,
      windowsHide: true,
    });
  }

  process.on('SIGINT', async () => {
    try {
      if (tuiInSameTerminal && tuiProc && tuiProc.exitCode === null) {
        tuiProc.kill('SIGINT');
      }
      await shutdown();
    } finally {
      process.exit(130);
    }
  });

  process.on('SIGTERM', async () => {
    try {
      if (tuiInSameTerminal && tuiProc && tuiProc.exitCode === null) {
        tuiProc.kill('SIGTERM');
      }
      await shutdown();
    } finally {
      process.exit(143);
    }
  });

  if (!tuiInSameTerminal) {
    // 后端子进程已启动时，本进程需保持运行直至用户 Ctrl+C（见 SIGINT）；否则仅新开 TUI 窗口时也可仅靠子进程存活
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

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(`[start:stack] FAILED: ${error.message}`);
  process.exit(1);
});
