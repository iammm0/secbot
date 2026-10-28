#!/usr/bin/env node
/**
 * 统一设置发布版本号，覆盖 monorepo 内所有需要同步版本的产物：
 *   - package.json（根：npm 包 @opensec/secbot，含 server/TUI/web/CLI）
 *   - terminal-ui/package.json
 *   - web/package.json
 *   - desktop/package.json
 *   - desktop/src-tauri/tauri.conf.json（Tauri 读取此 version 决定安装包版本）
 *   - desktop/src-tauri/Cargo.toml（[package] version）
 *   - web/src/generated/desktopVersion.ts（给设置页 / 更新检查用）
 *   - web/public/desktop-version.json
 *   - README* 中的 desktop-app-v* 示例
 *
 * 用法：node scripts/set-release-version.mjs <version>
 * 例：  node scripts/set-release-version.mjs 2.0.0
 *       node scripts/set-release-version.mjs 2.0.0-beta.42
 *
 * 仅供 CI / 本地发布使用；不会创建 git tag。
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

setJsonVersion(root, 'package.json', version);
setJsonVersion(root, 'terminal-ui/package.json', version);
setJsonVersion(root, 'web/package.json', version);
setJsonVersion(root, 'desktop/package.json', version);
setJsonVersion(root, 'desktop/src-tauri/tauri.conf.json', version);
setCargoVersion(root, 'desktop/src-tauri/Cargo.toml', version);
writeWebArtifacts(root, version);
updateReadmeExamples(root, version);

console.log(`\n全部版本已设置为 ${version}`);
console.log(`桌面端对应 Git 标签: ${TAG_PREFIX}${version}`);
