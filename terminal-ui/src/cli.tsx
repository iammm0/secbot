#!/usr/bin/env node
/**
 * CLI entry: requires a real TTY; uses alternate screen when supported.
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

/** On Windows without TTY: respawn in a new console; `npm run tui` builds then runs dist/cli.js */
function relaunchInNewWindow(): boolean {
  if (process.platform !== 'win32') return false;
  try {
    const cwd = process.cwd();
    const safeCwd = cwd.replace(/"/g, '""');
    const inner = `cd /d "${safeCwd}" && npm run tui`;
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
  const isTTY = !!process.stdin.isTTY;
  writeLaunchLog(`stdin.isTTY=${process.stdin.isTTY} stdout.isTTY=${process.stdout.isTTY} cwd=${process.cwd()}`);

  if (!isTTY) {
    if (relaunchInNewWindow()) {
      process.exit(0);
    }
    const msg =
      'Not a TTY. Ink requires a real terminal. Run: cd terminal-ui && npm run tui ' +
      '(or from repo root: npm run start:stack / scripts/start-cli.bat)';
    writeErrorLog('NO_TTY', msg);
    console.error(msg);
    console.error('Or from repo root: npm run start:stack (starts backend then TUI).');
    process.exit(1);
  }

  const backend = await checkBackend();
  if (!backend.ok) {
    const err = backend.error ?? 'unknown';
    writeErrorLog('BACKEND_UNREACHABLE', `${getBaseUrl()} ${err}`);
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
      console.error('Terminal does not support raw mode. Use CMD or PowerShell outside the IDE.');
    } else {
      console.error('Failed to start TUI:', msg);
    }
    console.error('Details written to ' + path.join(process.cwd(), TUI_ERROR_LOG));
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
