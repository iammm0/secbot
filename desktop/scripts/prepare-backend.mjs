#!/usr/bin/env node
/**
 * 为桌面端“正式打包”装配自包含后端资源：
 *
 *  desktop/src-tauri/backend/            → 作为 Tauri resources 打进安装包
 *    ├── server/dist/main.js             → NestJS 后端入口
 *    ├── web/dist/                        → 前端静态资源（后端 ServeStatic 托管）
 *    ├── node_modules/                    → 仅生产依赖（含当前平台原生 better-sqlite3）
 *    └── package.json                     → 供 node 解析
 *  desktop/src-tauri/binaries/
 *    └── secbot-node-<target-triple>[.exe] → 随包 Node 运行时（Tauri externalBin sidecar）
 *
 * 运行前需已构建 server/dist 与 web/dist（desktop 的 build:deps 会做）。
 * 生产依赖通过在临时目录执行 `npm ci --omit=dev` 获得，从而拿到与当前
 * 构建平台匹配的原生模块（CI 矩阵在每个 OS 上分别执行本脚本）。
 */
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, rmSync, copyFileSync, chmodSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const srcTauri = resolve(here, '..', 'src-tauri'); // desktop/src-tauri
const repoRoot = resolve(here, '..', '..'); // 仓库根

const backendDir = join(srcTauri, 'backend');
const binariesDir = join(srcTauri, 'binaries');

function log(msg) {
  console.log(`[prepare-backend] ${msg}`);
}

function ensureBuilt() {
  const serverEntry = join(repoRoot, 'server', 'dist', 'main.js');
  const webIndex = join(repoRoot, 'web', 'dist', 'index.html');
  if (!existsSync(serverEntry)) {
    throw new Error(`缺少 server/dist/main.js，请先执行 npm run build（server 构建）`);
  }
  if (!existsSync(webIndex)) {
    throw new Error(`缺少 web/dist/index.html，请先执行 npm run build:web`);
  }
}

/** 从 rustc 读取当前构建平台的 target triple（externalBin 命名需要）。 */
function rustTargetTriple() {
  if (process.env.SECBOT_TARGET_TRIPLE) return process.env.SECBOT_TARGET_TRIPLE.trim();
  const out = execFileSync('rustc', ['-vV'], { encoding: 'utf8' });
  const m = out.match(/host:\s*(\S+)/);
  if (!m) throw new Error('无法从 rustc -vV 解析 host target triple');
  return m[1];
}

function assembleBackend() {
  log('清理旧的 backend 目录');
  rmSync(backendDir, { recursive: true, force: true });
  mkdirSync(backendDir, { recursive: true });

  log('复制 server/dist 与 web/dist');
  cpSync(join(repoRoot, 'server', 'dist'), join(backendDir, 'server', 'dist'), { recursive: true });
  cpSync(join(repoRoot, 'web', 'dist'), join(backendDir, 'web', 'dist'), { recursive: true });

  log('复制 package.json / package-lock.json');
  copyFileSync(join(repoRoot, 'package.json'), join(backendDir, 'package.json'));
  copyFileSync(join(repoRoot, 'package-lock.json'), join(backendDir, 'package-lock.json'));

  log('安装生产依赖（npm ci --omit=dev，含平台原生模块）');
  execFileSync(
    process.platform === 'win32' ? 'npm.cmd' : 'npm',
    ['ci', '--omit=dev', '--no-audit', '--no-fund'],
    { cwd: backendDir, stdio: 'inherit' },
  );
}

function copyNodeRuntime() {
  const triple = rustTargetTriple();
  const isWin = process.platform === 'win32';
  mkdirSync(binariesDir, { recursive: true });
  const dest = join(binariesDir, `secbot-node-${triple}${isWin ? '.exe' : ''}`);
  log(`复制 Node 运行时 ${process.execPath} → ${dest}`);
  copyFileSync(process.execPath, dest);
  if (!isWin) chmodSync(dest, 0o755);
}

function main() {
  ensureBuilt();
  assembleBackend();
  copyNodeRuntime();
  log('后端资源装配完成');
}

main();
