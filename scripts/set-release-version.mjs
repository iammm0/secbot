#!/usr/bin/env node
/**
 * 统一设置发布版本号，覆盖 monorepo 内所有需要同步版本的产物：
 *   - package.json（根：npm 包 @opensec/secbot，含 server/TUI/web/CLI）
 *   - terminal-ui/package.json
 *   - web/package.json
 *   - desktop/package.json
 *   - desktop/src-tauri/tauri.conf.json（Tauri 读取此 version 决定安装包版本）
 *   - desktop/src-tauri/Cargo.toml（[package] version）
 *
 * 用法：node scripts/set-release-version.mjs <version>
 * 例：  node scripts/set-release-version.mjs 2.0.0
 *       node scripts/set-release-version.mjs 2.0.0-beta.42
 *
 * 仅供 CI / 本地发布使用；不会创建 git tag。
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

const version = (process.argv[2] || '').trim();
if (!version) {
  console.error('用法: node scripts/set-release-version.mjs <version>');
  process.exit(1);
}
// 宽松 semver 校验（允许 -beta.N / -rc.1 等预发布标识）
if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(version)) {
  console.error(`非法版本号: ${version}`);
  process.exit(1);
}

function setJsonVersion(relPath) {
  const p = join(root, relPath);
  if (!existsSync(p)) {
    console.warn(`[skip] 不存在: ${relPath}`);
    return;
  }
  const json = JSON.parse(readFileSync(p, 'utf8'));
  json.version = version;
  writeFileSync(p, `${JSON.stringify(json, null, 2)}\n`);
  console.log(`[ok] ${relPath} -> ${version}`);
}

function setCargoVersion(relPath) {
  const p = join(root, relPath);
  if (!existsSync(p)) {
    console.warn(`[skip] 不存在: ${relPath}`);
    return;
  }
  const src = readFileSync(p, 'utf8');
  // 仅替换 [package] 段内的首个 version = "..."
  let inPackage = false;
  let replaced = false;
  const out = src
    .split('\n')
    .map((line) => {
      if (/^\s*\[[^\]]+\]\s*$/.test(line)) {
        inPackage = /^\s*\[package\]\s*$/.test(line);
        return line;
      }
      if (inPackage && !replaced && /^\s*version\s*=/.test(line)) {
        replaced = true;
        return `version = "${version}"`;
      }
      return line;
    })
    .join('\n');
  if (!replaced) {
    console.warn(`[warn] 未在 [package] 段找到 version: ${relPath}`);
  }
  writeFileSync(p, out);
  console.log(`[ok] ${relPath} -> ${version}`);
}

setJsonVersion('package.json');
setJsonVersion('terminal-ui/package.json');
setJsonVersion('web/package.json');
setJsonVersion('desktop/package.json');
setJsonVersion('desktop/src-tauri/tauri.conf.json');
setCargoVersion('desktop/src-tauri/Cargo.toml');

console.log(`\n全部版本已设置为 ${version}`);
