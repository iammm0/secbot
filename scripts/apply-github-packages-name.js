#!/usr/bin/env node
/**
 * Release CI：将 package.json 调整为发布到 GitHub Packages。
 * GitHub npm registry 要求作用域与仓库所有者一致（与 npmjs 上的 @opensec/* 可并存为二次发布）。
 *
 * 环境变量：GITHUB_REPOSITORY_OWNER（由 Actions 注入）
 */
'use strict';

const fs = require('node:fs');
const path = require('node:path');

const owner = (process.env.GITHUB_REPOSITORY_OWNER || '').trim().toLowerCase();
if (!owner) {
  console.error('Missing GITHUB_REPOSITORY_OWNER');
  process.exit(1);
}

const pkgPath = path.join(__dirname, '..', 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const parts = String(pkg.name || '').split('/');
const tail = (parts.length >= 2 ? parts[1] : 'secbot').toLowerCase();

pkg.name = `@${owner}/${tail}`;
pkg.publishConfig = {
  registry: 'https://npm.pkg.github.com',
};

fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
