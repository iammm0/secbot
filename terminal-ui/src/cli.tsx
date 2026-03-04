#!/usr/bin/env node
/**
 * 入口：必须在真实终端（TTY）中运行，占据全屏并启用 alternate screen。
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import React from 'react';
import { render } from 'ink';
import { getBaseUrl, checkBackend } from './config.js';
import { AllProviders } from './contexts/index.js';
import { App } from './App.js';

const ALTERNATE_SCREEN_ON = '\x1b[?1049h';
const ALTERNATE_SCREEN_OFF = '\x1b[?1049l';

const TUI_ERROR_LOG = 'tui-error.log';

function leaveAlternateScreen() {
  try {
    process.stdout.write(ALTERNATE_SCREEN_OFF);
  } catch {
    // ignore
  }
}

/** 将错误写入 terminal-ui/tui-error.log，便于排查 */
function writeErrorLog(message: string, detail?: unknown) {
  try {
    const logPath = path.join(process.cwd(), TUI_ERROR_LOG);
    const line = `${new Date().toISOString()} ${message}${detail != null ? ` ${String(detail)}` : ''}\n`;
    fs.appendFileSync(logPath, line);
  } catch {
    // ignore
  }
}

/** 写启动日志到临时文件，便于排查 TTY/环境问题 */
function writeLaunchLog(line: string) {
  try {
    const logPath = path.join(process.cwd(), 'tui-launch.log');
    fs.appendFileSync(logPath, `${new Date().toISOString()} ${line}\n`);
  } catch {
    // ignore
  }
}

/** Windows 下无 TTY 时：在新控制台窗口重新启动自身，使新窗口有 TTY */
function relaunchInNewWindow(): boolean {
  if (process.platform !== 'win32') return false;
  try {
    const cwd = process.cwd();
    const env = { ...process.env };
    const child = spawn(
      'cmd',
      ['/c', 'start', 'SECBOT TUI', 'cmd', '/k', 'node --import tsx src/cli.tsx'],
      {
        cwd,
        env,
        stdio: 'ignore',
        windowsHide: false,
      },
    );
    child.unref();
    return true;
  } catch {
    return false;
  }
}

async function main() {
  const isTTY = !!process.stdin.isTTY;
  writeLaunchLog(`stdin.isTTY=${process.stdin.isTTY} stdout.isTTY=${process.stdout.isTTY} cwd=${process.cwd()}`);

  if (!isTTY) {
    if (relaunchInNewWindow()) {
      process.exit(0);
    }
    const msg =
      '当前不是真实终端（TTY），Ink 需要 TTY。已尝试在新窗口启动；若未弹出窗口请到系统 CMD/PowerShell 中执行: cd terminal-ui && npm run tui';
    writeErrorLog('NO_TTY', msg);
    console.error(msg);
    console.error('或: 在项目根目录执行 npm run dev（先启动后端）');
    process.exit(1);
  }

  const backend = await checkBackend();
  if (!backend.ok) {
    const err = backend.error ?? '未知';
    writeErrorLog('BACKEND_UNREACHABLE', `${getBaseUrl()} ${err}`);
    console.error('无法连接后端，请先启动：npm run dev');
    console.error('地址: ' + getBaseUrl());
    console.error('错误: ' + err);
    process.exit(1);
  }

  process.stdout.write(ALTERNATE_SCREEN_ON);
  process.on('exit', leaveAlternateScreen);

  const columns = (process.stdout as NodeJS.WriteStream & { columns?: number }).columns ?? 80;
  const rows = (process.stdout as NodeJS.WriteStream & { rows?: number }).rows ?? 24;
  const handleExit = (code?: number) => {
    leaveAlternateScreen();
    process.exit(code ?? 0);
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
    leaveAlternateScreen();
    const msg = err instanceof Error ? err.message : String(err);
    writeErrorLog('RENDER_ERROR', err);
    if (/raw mode|isRawModeSupported|stdin/.test(msg)) {
      console.error('终端不支持 Raw 模式。请在系统自带的 CMD 或 PowerShell（不要用 IDE 终端）中运行。');
    } else {
      console.error('启动失败:', msg);
    }
    console.error('详细错误已写入 ' + path.join(process.cwd(), TUI_ERROR_LOG));
    process.exit(1);
  }
}

process.on('uncaughtException', (err) => {
  writeErrorLog('uncaughtException', err?.stack ?? err);
  leaveAlternateScreen();
  console.error(err);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  writeErrorLog('unhandledRejection', String(reason));
  leaveAlternateScreen();
  console.error('Unhandled rejection:', reason);
  process.exit(1);
});

main();
