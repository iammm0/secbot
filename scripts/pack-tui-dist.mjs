#!/usr/bin/env node
/**
 * 为 TUI 打自包含发行包（随包 Node 运行时 + 生产依赖 + 后端/TUI/web）：
 *
 *   dist/tui/secbot-tui-<version>-<label>/
 *     node | node.exe
 *     secbot | secbot.cmd
 *     bin/  server/  terminal-ui/  web/  scripts/  node_modules/
 *
 * 用法：
 *   node scripts/pack-tui-dist.mjs [version] [label]
 *   省略 version 时读根 package.json；省略 label 时按当前平台推断。
 *
 * CI 矩阵在每个 OS 上原生执行，以便 better-sqlite3 与 Node 匹配目标平台。
 * 支持的正式标签：macos-arm64 / linux-x64 / windows-x64（不发布 macOS Intel）。
 */
import { execFileSync } from 'node:child_process';
import {
  appendFileSync,
  chmodSync,
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');
const outRoot = join(repoRoot, 'dist', 'tui');

function log(msg) {
  console.log(`[pack-tui] ${msg}`);
}

function inferLabel() {
  if (process.platform === 'darwin' && process.arch === 'arm64') return 'macos-arm64';
  if (process.platform === 'darwin') return 'macos-x64';
  if (process.platform === 'linux') return 'linux-x64';
  if (process.platform === 'win32') return 'windows-x64';
  return `${process.platform}-${process.arch}`;
}

function readRootVersion() {
  const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf8'));
  return String(pkg.version || '').trim();
}

const version = (process.argv[2] || readRootVersion()).trim().replace(/^v/, '');
const label = (process.argv[3] || inferLabel()).trim();
const isWin = process.platform === 'win32' || label.startsWith('windows');

if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(version)) {
  console.error(`非法版本号: ${version}`);
  process.exit(1);
}

const SUPPORTED = new Set(['macos-arm64', 'linux-x64', 'windows-x64']);
if (!SUPPORTED.has(label)) {
  console.error(
    `不支持的平台标签: ${label}（正式发布仅 macos-arm64 / linux-x64 / windows-x64，不含 macOS Intel）`,
  );
  process.exit(1);
}

function ensureBuilt() {
  const needed = [
    ['server/dist/main.js', 'npm run build'],
    ['terminal-ui/dist/cli.js', 'npm run build:terminal-ui'],
    ['web/dist/index.html', 'npm run build:web'],
    ['scripts/run-product.js', null],
    ['bin/secbot.js', null],
  ];
  for (const [rel, hint] of needed) {
    if (!existsSync(join(repoRoot, rel))) {
      throw new Error(`缺少 ${rel}${hint ? `，请先执行 ${hint}` : ''}`);
    }
  }
}

function setJsonVersion(filePath) {
  if (!existsSync(filePath)) return;
  const json = JSON.parse(readFileSync(filePath, 'utf8'));
  json.version = version;
  writeFileSync(filePath, `${JSON.stringify(json, null, 2)}\n`);
}

function assemble(stageDir) {
  log(`装配 ${stageDir}`);
  rmSync(stageDir, { recursive: true, force: true });
  mkdirSync(stageDir, { recursive: true });

  copyFileSync(join(repoRoot, 'package.json'), join(stageDir, 'package.json'));
  copyFileSync(join(repoRoot, 'package-lock.json'), join(stageDir, 'package-lock.json'));
  setJsonVersion(join(stageDir, 'package.json'));

  for (const rel of [
    'bin',
    'scripts/run-product.js',
    'server/dist',
    'server/skills',
    'terminal-ui/dist',
    'terminal-ui/package.json',
    'web/dist',
    'README.md',
    'LICENSE',
    'SECURITY_WARNING.md',
  ]) {
    const src = join(repoRoot, rel);
    const dest = join(stageDir, rel);
    if (!existsSync(src)) {
      log(`skip missing ${rel}`);
      continue;
    }
    mkdirSync(dirname(dest), { recursive: true });
    cpSync(src, dest, { recursive: true });
  }
  setJsonVersion(join(stageDir, 'terminal-ui', 'package.json'));

  writeFileSync(
    join(stageDir, 'README-TUI.txt'),
    [
      `Secbot TUI ${version} (${label})`,
      '',
      '解压后在本目录运行：',
      isWin ? '  secbot.cmd' : '  ./secbot',
      '',
      '无需安装 Node.js。默认会拉起随包的 NestJS 后端。',
      '平台：macOS Apple Silicon / Ubuntu x64 / Windows x64（不含 macOS Intel）。',
      '',
    ].join('\n'),
  );

  log('安装生产依赖（npm install --omit=dev）');
  const npmCacheDir = process.env.SECBOT_NPM_CACHE || join(tmpdir(), 'secbot-tui-npm-cache');
  mkdirSync(npmCacheDir, { recursive: true });
  execFileSync(
    'npm',
    ['install', '--omit=dev', '--no-audit', '--no-fund', '--cache', npmCacheDir],
    {
      cwd: stageDir,
      stdio: 'inherit',
      shell: true,
      env: { ...process.env, npm_config_cache: npmCacheDir },
    },
  );

  const nodeDest = join(stageDir, isWin ? 'node.exe' : 'node');
  log(`复制 Node 运行时 ${process.execPath} → ${nodeDest}`);
  copyFileSync(process.execPath, nodeDest);
  if (!isWin) chmodSync(nodeDest, 0o755);

  if (isWin) {
    writeFileSync(
      join(stageDir, 'secbot.cmd'),
      [
        '@echo off',
        'setlocal',
        'set "SECBOT_PACKAGE_ROOT=%~dp0"',
        '"%~dp0node.exe" "%~dp0bin\\secbot.js" %*',
        '',
      ].join('\r\n'),
    );
  } else {
    const launcher = join(stageDir, 'secbot');
    writeFileSync(
      launcher,
      [
        '#!/bin/sh',
        'ROOT="$(CDPATH= cd -- "$(dirname "$0")" && pwd)"',
        'export SECBOT_PACKAGE_ROOT="$ROOT"',
        'exec "$ROOT/node" "$ROOT/bin/secbot.js" "$@"',
        '',
      ].join('\n'),
    );
    chmodSync(launcher, 0o755);
  }
}

function archive(stageDir, folderName) {
  mkdirSync(outRoot, { recursive: true });
  const archiveName = isWin ? `${folderName}.zip` : `${folderName}.tar.gz`;
  const archivePath = join(outRoot, archiveName);
  rmSync(archivePath, { force: true });
  log(`打包 ${archivePath}`);
  if (isWin) {
    execFileSync('tar', ['-a', '-cf', archivePath, '-C', outRoot, folderName], {
      stdio: 'inherit',
    });
  } else {
    execFileSync('tar', ['-czf', archivePath, '-C', outRoot, folderName], { stdio: 'inherit' });
  }
  return archivePath;
}

function main() {
  ensureBuilt();
  const folderName = `secbot-tui-${version}-${label}`;
  const stageDir = join(outRoot, folderName);
  assemble(stageDir);
  const artifact = archive(stageDir, folderName);
  const artifactOut = artifact.replace(/\\/g, '/');
  log(`完成 ${artifactOut}`);
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `artifact=${artifactOut}\n`);
  }
  console.log(artifactOut);
}

main();
