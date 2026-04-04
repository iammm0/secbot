#!/usr/bin/env node

'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const TUI_DIR = path.join(ROOT, 'terminal-ui');
const NPM_EXEC_PATH = process.env.npm_execpath || '';
const DEFAULT_PORT = Number(process.env.PORT || 8000);

const FLAGS = new Set(process.argv.slice(2));
const PREPARE_ONLY = FLAGS.has('--prepare-only');
const NO_PULL = FLAGS.has('--no-pull');
const NO_INSTALL = FLAGS.has('--no-install');

function log(message) {
  // eslint-disable-next-line no-console
  console.log(`[start:latest] ${message}`);
}

function npmInvocation(args) {
  if (NPM_EXEC_PATH && fs.existsSync(NPM_EXEC_PATH)) {
    return { cmd: process.execPath, argv: [NPM_EXEC_PATH, ...args], shell: false };
  }
  if (process.platform === 'win32') {
    return { cmd: 'npm.cmd', argv: args, shell: false };
  }
  return { cmd: 'npm', argv: args, shell: false };
}

function run(cmd, args, options = {}) {
  const { cwd = ROOT, env, shell = false, stdio = 'inherit', allowFailure = false } = options;

  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd,
      env: env ?? process.env,
      shell,
      stdio,
      windowsHide: true,
    });

    let stdout = '';
    let stderr = '';
    if (stdio === 'pipe') {
      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', (chunk) => {
        stdout += chunk;
      });
      child.stderr.on('data', (chunk) => {
        stderr += chunk;
      });
    }

    child.once('error', reject);
    child.once('close', (code) => {
      const result = { code: code ?? -1, stdout, stderr };
      if (result.code === 0 || allowFailure) {
        resolve(result);
        return;
      }
      reject(
        new Error(
          `Command failed (${cmd} ${args.join(' ')}), exit=${result.code}\n${stderr || stdout}`,
        ),
      );
    });
  });
}

function runNpm(args, options = {}) {
  const inv = npmInvocation(args);
  return run(inv.cmd, inv.argv, { ...options, shell: inv.shell });
}

async function getCurrentBranch() {
  const result = await run('git', ['branch', '--show-current'], { stdio: 'pipe' });
  return result.stdout.trim();
}

async function hasUpstream() {
  const result = await run(
    'git',
    ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'],
    { stdio: 'pipe', allowFailure: true },
  );
  return result.code === 0 && result.stdout.trim().length > 0;
}

async function pullLatest() {
  log('Fetching remote updates...');
  await run('git', ['fetch', '--all', '--prune']);

  const branch = await getCurrentBranch();
  if (!branch) {
    throw new Error('Could not detect current branch.');
  }

  if (await hasUpstream()) {
    log(`Pulling latest commits for branch "${branch}"...`);
    await run('git', ['pull', '--rebase', '--autostash']);
    return;
  }

  log(`No upstream configured, pulling from origin/${branch}...`);
  await run('git', ['pull', '--rebase', '--autostash', 'origin', branch]);
}

async function ensureDeps() {
  log('Installing root dependencies...');
  await runNpm(['install']);

  log('Installing terminal-ui dependencies...');
  await runNpm(['install'], { cwd: TUI_DIR });
}

async function stopListeningProcessOnPort(port) {
  if (!Number.isFinite(port) || port <= 0) return;

  if (process.platform === 'win32') {
    const psScript = [
      `$pids = Get-NetTCPConnection -LocalPort ${port} -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique`,
      'if ($pids) {',
      '  foreach ($id in $pids) {',
      '    Stop-Process -Id $id -Force -ErrorAction SilentlyContinue',
      '    Write-Output \"killed=$id\"',
      '  }',
      '}',
    ].join('; ');
    const result = await run('powershell', ['-NoProfile', '-Command', psScript], {
      stdio: 'pipe',
      allowFailure: true,
    });
    if (result.stdout.trim()) {
      log(`Stopped existing backend process(es) on port ${port}: ${result.stdout.trim()}`);
    }
    return;
  }

  const shScript = `if command -v lsof >/dev/null 2>&1; then pids=$(lsof -ti tcp:${port}); if [ -n "$pids" ]; then kill -9 $pids; fi; fi`;
  await run('sh', ['-lc', shScript], { stdio: 'pipe', allowFailure: true });
}

async function main() {
  if (!NO_PULL) {
    await pullLatest();
  } else {
    log('Skipping git pull due to --no-pull');
  }

  if (!NO_INSTALL) {
    await ensureDeps();
  } else {
    log('Skipping npm install due to --no-install');
  }

  log(`Stopping old backend on port ${DEFAULT_PORT} (if any)...`);
  await stopListeningProcessOnPort(DEFAULT_PORT);

  if (PREPARE_ONLY) {
    log('Building backend...');
    await runNpm(['run', 'build']);
    log('Prepare-only completed.');
    return;
  }

  log('Launching full stack (start:stack will build backend then start TUI)...');
  await runNpm(['run', 'start:stack']);
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(`[start:latest] FAILED: ${error.message}`);
  process.exit(1);
});

