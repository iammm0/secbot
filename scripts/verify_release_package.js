#!/usr/bin/env node

'use strict';

const fs = require('node:fs');
const fsp = require('node:fs/promises');
const net = require('node:net');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const REPO_ROOT = path.resolve(__dirname, '..');
const NPM_EXEC_PATH = process.env.npm_execpath || '';
const VERIFY_PREFIX = '[release:verify]';

function nodeModulesDirForPackageName(packageName) {
  if (packageName.startsWith('@')) {
    const [scope, name] = packageName.split('/');
    if (!scope || !name) {
      throw new Error(`Invalid scoped package name: ${packageName}`);
    }
    return path.join('node_modules', scope, name);
  }
  return path.join('node_modules', packageName);
}

function log(message) {
  // eslint-disable-next-line no-console
  console.log(`${VERIFY_PREFIX} ${message}`);
}

function runCommand(cmd, args, options = {}) {
  const {
    cwd = REPO_ROOT,
    stdio = 'inherit',
    env,
    captureOutput = false,
    shell = false,
  } = options;

  return new Promise((resolve, reject) => {
    const spawnOptions = {
      cwd,
      stdio: captureOutput ? ['ignore', 'pipe', 'pipe'] : stdio,
      shell,
      windowsHide: true,
    };
    if (env) {
      spawnOptions.env = env;
    }

    const child = spawn(cmd, args, spawnOptions);

    let stdout = '';
    let stderr = '';

    if (captureOutput) {
      child.stdout.on('data', (chunk) => {
        stdout += chunk.toString();
      });
      child.stderr.on('data', (chunk) => {
        stderr += chunk.toString();
      });
    }

    child.once('error', (error) => reject(error));
    child.once('close', (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      const details = captureOutput
        ? `\nstdout:\n${stdout}\nstderr:\n${stderr}`
        : '';
      reject(new Error(`Command failed (${cmd} ${args.join(' ')}), exit code ${code}${details}`));
    });
  });
}

function runNpm(args, options = {}) {
  if (NPM_EXEC_PATH && fs.existsSync(NPM_EXEC_PATH)) {
    return runCommand(process.execPath, [NPM_EXEC_PATH, ...args], options);
  }

  if (process.platform === 'win32') {
    return runCommand('npm.cmd', args, options);
  }

  return runCommand('npm', args, options);
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function tailLogs(value, maxLines = 20) {
  return value
    .split(/\r?\n/)
    .filter((line) => line.trim() !== '')
    .slice(-maxLines)
    .join('\n');
}

function parseJsonText(raw, label) {
  try {
    return JSON.parse(raw.replace(/^\uFEFF/, '').trim());
  } catch (error) {
    throw new Error(`${label}: ${(error).message}`);
  }
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close(() => reject(new Error('Failed to allocate free port')));
        return;
      }
      const { port } = address;
      server.close((closeError) => {
        if (closeError) {
          reject(closeError);
          return;
        }
        resolve(port);
      });
    });
  });
}

async function stopProcess(child) {
  if (!child || child.exitCode !== null) return;

  child.kill('SIGTERM');
  const exited = await Promise.race([
    new Promise((resolve) => child.once('exit', () => resolve(true))),
    wait(5000).then(() => false),
  ]);

  if (!exited && child.exitCode === null) {
    child.kill('SIGKILL');
    await Promise.race([
      new Promise((resolve) => child.once('exit', () => resolve(true))),
      wait(3000).then(() => false),
    ]);
  }
}

async function waitForHealth(port, timeoutMs) {
  const startedAt = Date.now();
  const url = `http://127.0.0.1:${port}/health`;
  let lastError = null;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url, { method: 'GET' });
      if (response.ok) {
        const payload = await response.json();
        const status =
          payload?.data?.status ??
          payload?.status ??
          null;
        if (status === 'ok') return payload;
      }
      lastError = new Error(`Health endpoint returned HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await wait(500);
  }

  throw lastError ?? new Error('Health check timed out');
}

async function main() {
  log('Running release build');
  await runNpm(['run', 'release:build']);

  log('Packing npm tarball');
  const packOutput = await runNpm(
    ['pack', '--json'],
    { captureOutput: true },
  );

  const packJson = parseJsonText(packOutput.stdout, 'Failed to parse npm pack output');
  if (!Array.isArray(packJson) || packJson.length === 0 || !packJson[0]?.filename) {
    throw new Error('npm pack output does not contain tarball filename');
  }

  const tarballFile = packJson[0].filename;
  const tarballPath = path.resolve(REPO_ROOT, tarballFile);
  if (!fs.existsSync(tarballPath)) {
    throw new Error(`Tarball not found: ${tarballPath}`);
  }
  log(`Tarball ready: ${tarballFile}`);

  const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'secbot-release-verify-'));
  log(`Using temp directory: ${tempDir}`);
  const npmCacheDir = path.join(tempDir, '.npm-cache');
  const npmEnv = {
    ...process.env,
    npm_config_cache: npmCacheDir,
  };

  let serverProc = null;
  let serverStdout = '';
  let serverStderr = '';

  try {
    await runNpm(['init', '-y'], { cwd: tempDir, stdio: 'ignore', env: npmEnv });
    await runNpm(['install', tarballPath, '--silent'], { cwd: tempDir, env: npmEnv });

    const rootPkg = parseJsonText(
      await fsp.readFile(path.join(REPO_ROOT, 'package.json'), 'utf8'),
      'Failed to read root package.json',
    );
    const installedPkgPath = path.join(tempDir, nodeModulesDirForPackageName(rootPkg.name), 'package.json');
    if (!fs.existsSync(installedPkgPath)) {
      throw new Error('Installed package.json not found');
    }

    const installedPkg = parseJsonText(
      await fsp.readFile(installedPkgPath, 'utf8'),
      'Failed to parse installed package.json',
    );
    const binMap = installedPkg?.bin ?? {};
    const binRelative = binMap['secbot-server'] || binMap.secbot;
    if (!binRelative || typeof binRelative !== 'string') {
      throw new Error('Installed package bin entry is missing');
    }

    const serverEntry = path.join(path.dirname(installedPkgPath), binRelative);
    if (!fs.existsSync(serverEntry)) {
      throw new Error(`Installed server entry not found: ${serverEntry}`);
    }

    const port = await getFreePort();
    log(`Starting packaged server on port ${port}`);

    serverProc = spawn(process.execPath, [serverEntry], {
      cwd: tempDir,
      env: {
        ...process.env,
        PORT: String(port),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
      windowsHide: true,
    });

    serverProc.stdout.on('data', (chunk) => {
      serverStdout += chunk.toString();
    });
    serverProc.stderr.on('data', (chunk) => {
      serverStderr += chunk.toString();
    });

    serverProc.once('error', (error) => {
      serverStderr += `\nprocess error: ${error.message}\n`;
    });

    let healthPayload;
    try {
      healthPayload = await waitForHealth(port, 25000);
    } catch (error) {
      const stdoutTail = tailLogs(serverStdout);
      const stderrTail = tailLogs(serverStderr);
      throw new Error(
        `Health check failed: ${error.message}\n` +
        `stdout tail:\n${stdoutTail || '(empty)'}\n` +
        `stderr tail:\n${stderrTail || '(empty)'}`,
      );
    }
    const healthStatus = healthPayload?.data?.status ?? healthPayload?.status ?? 'unknown';
    log(`Health check passed (status=${healthStatus})`);
  } finally {
    await stopProcess(serverProc);
    try {
      await fsp.rm(tempDir, { recursive: true, force: true });
    } catch {
      // ignore cleanup failures
    }
  }

  log('Release package verification succeeded');
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error(`${VERIFY_PREFIX} FAILED: ${error.message}`);
  if (error.stack) {
    // eslint-disable-next-line no-console
    console.error(error.stack);
  }
  process.exit(1);
});
