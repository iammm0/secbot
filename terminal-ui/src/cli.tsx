#!/usr/bin/env node
/**
 * 入口：必须在真实终端（TTY）中运行，占据全屏并启用 alternate screen�?
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

/** 将错误写�?terminal-ui/tui-error.log，便于排�?*/
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

/** 写启动日志到临时文件，便于排�?TTY/环境问题 */
function writeLaunchLog(line: string) {
  try {
    const logPath = path.join(process.cwd(), TUI_LAUNCH_LOG);
    appendLogLine(logPath, line);
    appendLogLine(TUI_RUNTIME_LOG, `[launch] ${line}`);
  } catch {
    // ignore
  }
}

/** Windows 下无 TTY 时：在新控制台窗口重新启动自身，使新窗口�?TTY */
function relaunchInNewWindow(): boolean {
  if (process.platform !== 'win32') return false;
  try {
    const cwd = process.cwd();
    const env = { ...process.env };
    const child = spawn('cmd', ['/c', 'start', 'SECBOT TUI', 'cmd', '/k', 'node --import tsx src/cli.tsx'], {
      cwd,
      env,
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
  const isTTY = !!process.stdin.isTTY;
  writeLaunchLog(`stdin.isTTY=${process.stdin.isTTY} stdout.isTTY=${process.stdout.isTTY} cwd=${process.cwd()}`);

  if (!isTTY) {
    if (relaunchInNewWindow()) {
      process.exit(0);
    }
    const msg = '当前不是真实终端（TTY），Ink 需�?TTY。已尝试在新窗口启动；若未弹出窗口请到系�?CMD/PowerShell 中执�? cd terminal-ui && npm run tui';
    writeErrorLog('NO_TTY', msg);
    console.error(msg);
    console.error('�? 在项目根目录执行 npm run start:stack（会先启动后端再开 TUI�?);
    process.exit(1);
  }

  const backend = await checkBackend();
  if (!backend.ok) {
    const err = backend.error ?? '未知';
    writeErrorLog('BACKEND_UNREACHABLE', `${getBaseUrl()} ${err}`);
    console.error('无法连接后端，请先启动：npm run start');
    console.error('地址: ' + getBaseUrl());
    console.error('错误: ' + err);
    process.exit(1);
  }

  process.stdout.write(ALTERNATE_SCREEN_ON);
  writeLaunchLog(`alternate-screen enabled columns=${process.stdout.columns ?? 'unknown'} rows=${process.stdout.rows ?? 'unknown'}`);
  process.on('exit', leaveAlternateScreen);

  const columns = (process.stdout as NodeJS.WriteStream & { columns?: number }).columns ?? 100;
  const rows = (process.stdout as NodeJS.WriteStream & { rows?: number }).rows ?? 32;
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
      console.error('终端不支�?Raw 模式。请在系统自带的 CMD �?PowerShell（不要用 IDE 终端）中运行�?);
    } else {
      console.error('启动失败:', msg);
    }
    console.error('详细错误已写�?' + path.join(process.cwd(), TUI_ERROR_LOG));
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


