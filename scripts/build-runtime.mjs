#!/usr/bin/env node
/**
 * Build script for Secbot internal runtime:
 *   - runtime/execgo (Go control plane: execgo daemon + execgocli)
 *   - runtime/execgo-runtime (Rust data plane: execgo-runtime sandbox daemon)
 *
 * Output binaries are placed in `runtime/bin/`.
 *
 * Usage:
 *   node scripts/build-runtime.mjs [options]
 *
 * Options:
 *   --only-go      Build only Go components (execgo + execgocli)
 *   --only-rust    Build only Rust component (execgo-runtime)
 *   --skip-rust    Skip Rust component build
 *   --clean        Remove runtime/bin before building
 */

import { execFileSync, spawnSync } from 'node:child_process';
import { chmodSync, copyFileSync, existsSync, mkdirSync, rmSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const runtimeDir = join(repoRoot, 'runtime');
const binDir = join(runtimeDir, 'bin');
const execgoDir = join(runtimeDir, 'execgo');
const execgoRuntimeDir = join(runtimeDir, 'execgo-runtime');

const isWin = process.platform === 'win32';
const exeExt = isWin ? '.exe' : '';

const args = process.argv.slice(2);
const onlyGo = args.includes('--only-go');
const onlyRust = args.includes('--only-rust');
const skipRust = args.includes('--skip-rust') || onlyGo;
const cleanFirst = args.includes('--clean');

function log(msg) {
  console.log(`[build-runtime] ${msg}`);
}

function error(msg) {
  console.error(`[build-runtime] ❌ ${msg}`);
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function findExecutable(name, extraCandidates = []) {
  const envPath = process.env.PATH || '';
  const pathDirs = envPath.split(isWin ? ';' : ':');
  const candidates = [
    ...extraCandidates,
    ...pathDirs.map((dir) => join(dir, name + exeExt)),
    ...pathDirs.map((dir) => join(dir, name)),
  ];

  for (const candidate of candidates) {
    if (candidate && existsSync(candidate)) {
      try {
        const res = spawnSync(candidate, ['--version'], { encoding: 'utf8' });
        if (res.status === 0 || res.stdout || res.stderr) {
          return candidate;
        }
      } catch {
        /* continue */
      }
    }
  }
  return null;
}

function getGoCompiler() {
  const home = homedir();
  const extra = [
    '/usr/local/go/bin/go',
    '/opt/homebrew/bin/go',
    join(home, 'go', 'bin', 'go'),
    'C:\\Program Files\\Go\\bin\\go.exe',
  ];
  return findExecutable('go', extra);
}

function getCargoCompiler() {
  const home = homedir();
  const extra = [
    join(home, '.cargo', 'bin', 'cargo' + exeExt),
    '/usr/local/bin/cargo',
    '/opt/homebrew/bin/cargo',
    'C:\\Program Files\\Rust\\bin\\cargo.exe',
  ];
  return findExecutable('cargo', extra);
}

function buildGo(goBin) {
  log(`Found Go compiler at ${goBin}`);
  if (!existsSync(join(execgoDir, 'go.mod'))) {
    throw new Error(`Directory ${execgoDir} does not contain go.mod`);
  }

  const goTargets = [
    { name: `execgo${exeExt}`, pkg: './cmd/execgo' },
    { name: `execgocli${exeExt}`, pkg: './cmd/execgocli' },
  ];

  for (const target of goTargets) {
    const outPath = join(binDir, target.name);
    log(`Building Go binary ${target.name} (${target.pkg}) ...`);
    const buildArgs = ['build', '-ldflags=-s -w', '-o', outPath, target.pkg];
    execFileSync(goBin, buildArgs, {
      cwd: execgoDir,
      stdio: 'inherit',
      env: {
        ...process.env,
        CGO_ENABLED: '0',
      },
    });
    if (!isWin) chmodSync(outPath, 0o755);
    const size = statSync(outPath).size;
    log(`✓ Generated ${target.name} (${formatBytes(size)})`);
  }
}

function buildRust(cargoBin) {
  log(`Found Cargo compiler at ${cargoBin}`);
  if (!existsSync(join(execgoRuntimeDir, 'Cargo.toml'))) {
    throw new Error(`Directory ${execgoRuntimeDir} does not contain Cargo.toml`);
  }

  log(`Building Rust sandbox runtime (release profile) ...`);
  execFileSync(cargoBin, ['build', '--release'], {
    cwd: execgoRuntimeDir,
    stdio: 'inherit',
    env: process.env,
  });

  const srcBinary = join(execgoRuntimeDir, 'target', 'release', `execgo-runtime${exeExt}`);
  const destBinary = join(binDir, `execgo-runtime${exeExt}`);
  if (!existsSync(srcBinary)) {
    throw new Error(`Expected cargo target binary at ${srcBinary} not found`);
  }

  copyFileSync(srcBinary, destBinary);
  if (!isWin) chmodSync(destBinary, 0o755);
  const size = statSync(destBinary).size;
  log(`✓ Generated execgo-runtime${exeExt} (${formatBytes(size)})`);
}

function main() {
  log(`=== Secbot Runtime Build ===`);
  log(`Repo root: ${repoRoot}`);

  if (cleanFirst && existsSync(binDir)) {
    log(`Cleaning old ${binDir} ...`);
    rmSync(binDir, { recursive: true, force: true });
  }
  mkdirSync(binDir, { recursive: true });

  const goBin = getGoCompiler();
  const cargoBin = getCargoCompiler();

  let goBuilt = false;
  let rustBuilt = false;

  if (!onlyRust) {
    if (goBin) {
      buildGo(goBin);
      goBuilt = true;
    } else {
      error(`Go compiler not found! Please install Go >= 1.22 (https://go.dev/dl/).`);
      if (onlyGo) process.exit(1);
    }
  }

  if (!skipRust) {
    if (cargoBin) {
      buildRust(cargoBin);
      rustBuilt = true;
    } else {
      log(`⚠️ Cargo/Rust compiler not found. Rust sandbox runtime build skipped.`);
      log(`   (ExecGo will operate in standard process execution mode).`);
      if (onlyRust) process.exit(1);
    }
  }

  log(`=== Build Summary ===`);
  log(`Binaries directory: ${binDir}`);
  if (goBuilt) log(`  - execgo${exeExt}`);
  if (goBuilt) log(`  - execgocli${exeExt}`);
  if (rustBuilt) log(`  - execgo-runtime${exeExt}`);
  log(`Done.`);
}

main();
