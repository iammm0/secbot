#!/usr/bin/env node

'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const TUI_DIR = path.join(ROOT, 'terminal-ui');
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

/**
 * Windows cmd.exe 参数转义。
 */
function quoteCmdArg(arg) {
  if (/[ \t"]/.test(arg)) {
    return `"${arg.replace(/"/g, '""')}"`;
  }
  return arg;
}

/**
 * IDE 集成终端通常无真实 TTY，Ink 无法在同一进程内运行。
 * 在 Windows 上通过「新控制台窗口」启动 TUI。
 */
function launchTuiInNewWindowsConsole(cliArgs) {
  const batPath = path.join(os.tmpdir(), `secbot-tui-${process.pid}-${Date.now()}.bat`);
  const safeUrl = (process.env.SECBOT_API_URL || '').replace(/"/g, '').replace(/\r?\n/g, '');
  const safeRootEnv = ROOT.replace(/"/g, '').replace(/\r?\n/g, '');
  const safeDir = TUI_DIR.replace(/"/g, '""');
  const argsText = cliArgs.map(quoteCmdArg).join(' ');
  const body = [
    '@echo off',
    `set "SECBOT_PACKAGE_ROOT=${safeRootEnv}"`,
    ...(safeUrl ? [`set "SECBOT_API_URL=${safeUrl}"`] : []),
    `cd /d "${safeDir}"`,
    `call npm.cmd run tui${argsText ? ` -- ${argsText}` : ''}`,
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
  const cliArgs = process.argv.slice(2);

  await buildBackendLatest();
  await ensureTuiDeps();

  const tuiEnv = {
    ...process.env,
    SECBOT_PACKAGE_ROOT: ROOT,
  };

  let tuiProc = null;

  if (!hasTTY && process.platform === 'win32') {
    log('当前无真实 TTY（常见于 Cursor/VS Code 集成终端），将在新控制台窗口中启动 TUI。');
    log('Starting terminal TUI in a new window...');
    launchTuiInNewWindowsConsole(cliArgs);
    log('TUI 已在新窗口启动。');
    process.exit(0);
  } else if (!hasTTY) {
    log('当前终端无真实 TTY，无法在此进程内启动 Ink TUI。');
    log('请在系统终端中执行：npm run start:stack，或 Windows 下双击 scripts\\start-cli.bat');
    process.exit(1);
  } else {
    log('Starting terminal TUI (default: local spawned backend)...');
    const tuiCommand = cliArgs.length > 0
      ? ['run', 'tui', '--', ...cliArgs]
      : ['run', 'tui'];
    const tuiNpm = npmInvocation(tuiCommand);
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
      if (tuiProc && tuiProc.exitCode === null) {
        tuiProc.kill('SIGINT');
      }
    } finally {
      process.exit(130);
    }
  });

  process.on('SIGTERM', async () => {
    try {
      if (tuiProc && tuiProc.exitCode === null) {
        tuiProc.kill('SIGTERM');
      }
    } finally {
      process.exit(143);
    }
  });

  const tuiCode = await new Promise((resolve, reject) => {
    tuiProc.once('error', reject);
    tuiProc.once('close', (code) => resolve(code ?? 0));
  });

  process.exit(tuiCode);
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(`[start:stack] FAILED: ${error.message}`);
  process.exit(1);
});
