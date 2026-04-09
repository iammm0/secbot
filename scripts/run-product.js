#!/usr/bin/env node
/**
 * 全局安装 / npm pack 后的单入口：启动 terminal-ui（Ink TUI）作为主控。
 * 后端模式由 TUI 决定：默认本地子进程，service/remote 为显式服务模式。
 * 仓库开发时仍可用 npm run start:stack。
 */
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const PACKAGE_ROOT = path.resolve(__dirname, '..');
const TUI_CLI = path.join(PACKAGE_ROOT, 'terminal-ui', 'dist', 'cli.js');

function log(message) {
  // eslint-disable-next-line no-console
  console.log(`[secbot] ${message}`);
}

function quoteCmdArg(arg) {
  if (/[ \t"]/.test(arg)) {
    return `"${arg.replace(/"/g, '""')}"`;
  }
  return arg;
}

function launchTuiInNewWindowsConsole(cliArgs) {
  const batPath = path.join(os.tmpdir(), `secbot-tui-${process.pid}-${Date.now()}.bat`);
  const safeUrl = (process.env.SECBOT_API_URL || '').replace(/"/g, '').replace(/\r?\n/g, '');
  const argsText = cliArgs.map(quoteCmdArg).join(' ');
  const safePkgRoot = PACKAGE_ROOT.replace(/"/g, '').replace(/\r?\n/g, '');
  const safeRoot = PACKAGE_ROOT.replace(/"/g, '""');
  const safeCli = TUI_CLI.replace(/"/g, '""');
  const body = [
    '@echo off',
    `set "SECBOT_PACKAGE_ROOT=${safePkgRoot}"`,
    ...(safeUrl ? [`set "SECBOT_API_URL=${safeUrl}"`] : []),
    `cd /d "${safeRoot}"`,
    `node "${safeCli}"${argsText ? ` ${argsText}` : ''}`,
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
  if (!fs.existsSync(TUI_CLI)) {
    // eslint-disable-next-line no-console
    console.error('[secbot] Missing TUI build. Reinstall @opensec/secbot.');
    process.exit(1);
  }

  const cliArgs = process.argv.slice(2);
  const tuiEnv = {
    ...process.env,
    SECBOT_PACKAGE_ROOT: PACKAGE_ROOT,
  };

  const hasTTY = Boolean(process.stdin.isTTY && process.stdout.isTTY);

  let tuiProc = null;

  if (!hasTTY && process.platform === 'win32') {
    log('No TTY in this terminal; opening the TUI in a new console window.');
    launchTuiInNewWindowsConsole(cliArgs);
    process.exit(0);
  } else if (!hasTTY) {
    // eslint-disable-next-line no-console
    console.error(
      '[secbot] No TTY. Open a system terminal (cmd/PowerShell/iTerm) and run `secbot` again.',
    );
    process.exit(1);
  } else {
    log('Starting TUI (default: local spawned backend)...');
    tuiProc = spawn(process.execPath, [TUI_CLI, ...cliArgs], {
      cwd: PACKAGE_ROOT,
      env: tuiEnv,
      stdio: 'inherit',
      windowsHide: true,
    });
  }

  const onSignal = async (signal, exitCode) => {
    try {
      if (tuiProc && tuiProc.exitCode === null) {
        tuiProc.kill(signal);
      }
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

  const tuiCode = await new Promise((resolve, reject) => {
    tuiProc.once('error', reject);
    tuiProc.once('close', (code) => resolve(code ?? 0));
  });

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
