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
const net = require('node:net');
const { spawn } = require('node:child_process');

const PACKAGE_ROOT = path.resolve(__dirname, '..');
const TUI_CLI = path.join(PACKAGE_ROOT, 'terminal-ui', 'dist', 'cli.js');
const SERVER_ENTRY = path.join(PACKAGE_ROOT, 'server', 'dist', 'main.js');

function log(message) {
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function canBindPort(port) {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.once('error', () => resolve(false));
    server.listen(port, '127.0.0.1', () => {
      server.close(() => resolve(true));
    });
  });
}

function allocateEphemeralPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (!addr || typeof addr !== 'object') {
        server.close(() => reject(new Error('Failed to allocate port')));
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

async function resolveSpawnPort() {
  if (await canBindPort(8000)) {
    return 8000;
  }
  return await allocateEphemeralPort();
}

async function waitForBackendReady(baseUrl, totalMs = 25000) {
  const started = Date.now();
  while (Date.now() - started < totalMs) {
    try {
      const res = await fetch(`${baseUrl}/api/system/info`);
      if (res.ok) return true;
    } catch {}
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

async function spawnBackendForCli() {
  if (!fs.existsSync(SERVER_ENTRY)) {
    throw new Error('Missing server build. Reinstall @opensec/secbot.');
  }

  const port = await resolveSpawnPort();
  const baseUrl = `http://127.0.0.1:${port}`;
  const child = spawn(process.execPath, [SERVER_ENTRY], {
    cwd: PACKAGE_ROOT,
    env: {
      ...process.env,
      PORT: String(port),
      SECBOT_PACKAGE_ROOT: PACKAGE_ROOT,
      SECBOT_WORKSPACE_ROOT: process.env.SECBOT_WORKSPACE_ROOT || process.cwd(),
    },
    stdio: 'ignore',
    windowsHide: true,
  });

  const ready = await waitForBackendReady(baseUrl);
  if (!ready) {
    await stopProcess(child);
    throw new Error(`Backend startup timed out at ${baseUrl}`);
  }

  return {
    baseUrl,
    stop: () => stopProcess(child),
  };
}

function parseFlagValues(args, flag) {
  const values = [];
  for (let i = 0; i < args.length; i += 1) {
    if (args[i] !== flag) continue;
    const segment = [];
    let j = i + 1;
    while (j < args.length && !args[j].startsWith('--')) {
      segment.push(args[j]);
      j += 1;
    }
    if (segment.length > 0) {
      values.push(segment.join(' '));
    }
    i = j - 1;
  }
  return values;
}

function parseSingleFlag(args, flag) {
  return parseFlagValues(args, flag)[0];
}

async function runSkillsCommand(args) {
  const sub = (args[0] || 'list').toLowerCase();
  const backend = await spawnBackendForCli();
  try {
    if (sub === 'list') {
      const res = await fetch(`${backend.baseUrl}/api/skills`);
      const json = await res.json();
      const data = json.data || json;
      const lines = (data.skills || []).map((skill) => `${skill.slug}: ${skill.description}`);
      console.log(lines.join('\n') || 'No skills found.');
      return;
    }

    if (sub === 'create') {
      const name = args[1];
      if (!name) {
        throw new Error('Usage: secbot skills create <name> [--description ...] [--trigger ...] [--tag ...] [--prerequisite ...] [--author ...]');
      }
      const payload = {
        name,
        description: parseSingleFlag(args, '--description'),
        author: parseSingleFlag(args, '--author'),
        tags: parseFlagValues(args, '--tag'),
        triggers: parseFlagValues(args, '--trigger'),
        prerequisites: parseFlagValues(args, '--prerequisite'),
      };
      const res = await fetch(`${backend.baseUrl}/api/skills`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${await res.text()}`);
      }
      const json = await res.json();
      const data = json.data || json;
      console.log(`Created skill ${data.slug} at ${data.relativeDir}`);
      return;
    }

    if (sub === 'view') {
      const name = args[1];
      if (!name) {
        throw new Error('Usage: secbot skills view <name>');
      }
      const res = await fetch(`${backend.baseUrl}/api/skills/${encodeURIComponent(name)}`);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${await res.text()}`);
      }
      const json = await res.json();
      const data = json.data || json;
      console.log(`## ${data.slug}\n\n${data.description}\n\n${data.body}`);
      return;
    }

    throw new Error(`Unknown skills command: ${sub}`);
  } finally {
    await backend.stop();
  }
}

async function start() {
  const cliArgs = process.argv.slice(2);
  if (cliArgs[0] === 'skills') {
    await runSkillsCommand(cliArgs.slice(1));
    return;
  }

  if (!fs.existsSync(TUI_CLI)) {
    console.error('[secbot] Missing TUI build. Reinstall @opensec/secbot.');
    process.exit(1);
  }

  const tuiEnv = {
    ...process.env,
    SECBOT_PACKAGE_ROOT: PACKAGE_ROOT,
    SECBOT_WORKSPACE_ROOT: process.env.SECBOT_WORKSPACE_ROOT || process.cwd(),
  };

  const hasTTY = Boolean(process.stdin.isTTY && process.stdout.isTTY);
  let tuiProc = null;

  if (!hasTTY && process.platform === 'win32') {
    log('No TTY in this terminal; opening the TUI in a new console window.');
    launchTuiInNewWindowsConsole(cliArgs);
    process.exit(0);
  } else if (!hasTTY) {
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
    console.error(`[secbot] ${error.message}`);
    process.exit(1);
  });
}
