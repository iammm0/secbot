#!/usr/bin/env node
/**
 * 仅同步桌面端版本号（不改根 npm 包 / TUI）。
 *
 * 覆盖：
 *   - desktop/package.json
 *   - desktop/src-tauri/tauri.conf.json
 *   - desktop/src-tauri/Cargo.toml
 *   - web/src/generated/desktopVersion.ts（给设置页 / 更新检查用）
 *   - web/public/desktop-version.json
 *   - README* 中的 desktop-app-v* 示例
 *
 * 用法：node scripts/set-desktop-version.mjs 0.0.1-beta
 * Tag 约定：desktop-app-v${version}  →  desktop-app-v0.0.1-beta
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  setJsonVersion,
  setCargoVersion,
  writeWebArtifacts,
  updateReadmeExamples,
  TAG_PREFIX,
} from './lib/set-version-common.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const version = (process.argv[2] || '').trim().replace(/^v/, '');
if (!version) {
  console.error('用法: node scripts/set-desktop-version.mjs <version>');
  process.exit(1);
}
if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(version)) {
  console.error(`非法版本号: ${version}`);
  process.exit(1);
}

setJsonVersion(root, 'desktop/package.json', version);
setJsonVersion(root, 'desktop/src-tauri/tauri.conf.json', version);
setCargoVersion(root, 'desktop/src-tauri/Cargo.toml', version);
writeWebArtifacts(root, version);
updateReadmeExamples(root, version);

console.log(`\n桌面端版本已设置为 ${version}`);
console.log(`对应 Git 标签: ${TAG_PREFIX}${version}`);
