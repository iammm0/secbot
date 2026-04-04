#!/usr/bin/env node

'use strict';

const fs = require('node:fs');
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

async function ensureBackendBuild() {
  if (fs.existsSync(BACKEND_ENTRY)) return;
  log('Backend dist not found, building TypeScript backend...');
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

async function main() {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    log('Current terminal has no real TTY; open CMD/PowerShell/Windows Terminal to run TUI.');
  }

  await ensureBackendBuild();
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

  log('Starting terminal TUI...');
  const tuiNpm = npmInvocation(['run', 'tui']);
  const tuiProc = spawn(tuiNpm.cmd, tuiNpm.argv, {
    cwd: TUI_DIR,
    env: tuiEnv,
    stdio: 'inherit',
    shell: tuiNpm.shell,
    windowsHide: true,
  });

  const shutdown = async () => {
    if (startedBackend) {
      await stopProcess(backendProc);
    }
  };

  process.on('SIGINT', async () => {
    try {
      if (tuiProc.exitCode === null) tuiProc.kill('SIGINT');
      await shutdown();
    } finally {
      process.exit(130);
    }
  });

  process.on('SIGTERM', async () => {
    try {
      if (tuiProc.exitCode === null) tuiProc.kill('SIGTERM');
      await shutdown();
    } finally {
      process.exit(143);
    }
  });

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
