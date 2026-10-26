#!/usr/bin/env node
/**
 * 下载可随包分发的 portable 安全工具到 tools/<platform>/。
 *
 * 用法：
 *   node scripts/fetch-bundled-tools.mjs [windows-x64|linux-x64|macos-arm64]
 *
 * 当前打包：nuclei、ffuf（官方 GitHub Release zip）。
 * 不打包 nmap（Npcap）/ nikto（Perl）。
 */
import { execFileSync } from 'node:child_process';
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, '..');

function log(msg) {
  console.log(`[fetch-bundled-tools] ${msg}`);
}

export function inferLabel() {
  if (process.platform === 'win32') return 'windows-x64';
  if (process.platform === 'darwin' && process.arch === 'arm64') return 'macos-arm64';
  if (process.platform === 'linux') return 'linux-x64';
  throw new Error(`无法推断平台，请显式传入 windows-x64 / linux-x64 / macos-arm64`);
}

export const SPEC = {
  'windows-x64': {
    dir: 'win-x64',
    nuclei: {
      owner: 'projectdiscovery',
      repo: 'nuclei',
      match: /windows_amd64\.zip$/i,
      bin: 'nuclei.exe',
    },
    ffuf: { owner: 'ffuf', repo: 'ffuf', match: /windows_amd64\.zip$/i, bin: 'ffuf.exe' },
  },
  'linux-x64': {
    dir: 'linux-x64',
    nuclei: {
      owner: 'projectdiscovery',
      repo: 'nuclei',
      match: /linux_amd64\.zip$/i,
      bin: 'nuclei',
    },
    ffuf: { owner: 'ffuf', repo: 'ffuf', match: /linux_amd64\.tar\.gz$/i, bin: 'ffuf' },
  },
  'macos-arm64': {
    dir: 'macos-arm64',
    nuclei: {
      owner: 'projectdiscovery',
      repo: 'nuclei',
      match: /macOS_arm64\.zip$/i,
      bin: 'nuclei',
    },
    ffuf: { owner: 'ffuf', repo: 'ffuf', match: /macOS_arm64\.tar\.gz$/i, bin: 'ffuf' },
  },
};

async function latestAsset(owner, repo, match) {
  const url = `https://api.github.com/repos/${owner}/${repo}/releases/latest`;
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'secbot-fetch-bundled-tools',
  };
  if (process.env.GITHUB_TOKEN) {
    headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  }
  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`GitHub API ${owner}/${repo}: HTTP ${response.status}`);
  }
  const release = await response.json();
  const asset = (release.assets || []).find((item) => match.test(String(item.name || '')));
  if (!asset?.browser_download_url) {
    throw new Error(`未找到匹配资源 ${owner}/${repo} ${match}`);
  }
  return { name: asset.name, url: asset.browser_download_url, tag: release.tag_name };
}

async function download(url, dest) {
  const response = await fetch(url, {
    headers: {
      'User-Agent': 'secbot-fetch-bundled-tools',
      ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
    },
    redirect: 'follow',
  });
  if (!response.ok) throw new Error(`下载失败 ${url}: HTTP ${response.status}`);
  const buf = Buffer.from(await response.arrayBuffer());
  writeFileSync(dest, buf);
}

export function extractArchive(archivePath, outDir) {
  mkdirSync(outDir, { recursive: true });
  const isZip = archivePath.toLowerCase().endsWith('.zip');
  if (isZip) {
    if (process.platform === 'win32') {
      // Windows 10/11 内置 bsdtar 支持 zip；若失败可回退 powershell Expand-Archive
      try {
        execFileSync('tar', ['-xf', archivePath, '-C', outDir], { stdio: 'inherit' });
        return;
      } catch {
        execFileSync(
          'powershell.exe',
          [
            '-NoProfile',
            '-Command',
            `Expand-Archive -LiteralPath '${archivePath}' -DestinationPath '${outDir}' -Force`,
          ],
          { stdio: 'inherit' },
        );
        return;
      }
    }

    // Linux / macOS: GNU tar 不支持 zip（Ubuntu 下 tar -xf *.zip 会报错）；
    // 优先 unzip，其次 python3 -m zipfile，最后回退 tar（如 macOS bsdtar 支持 zip）。
    const errors = [];
    try {
      execFileSync('unzip', ['-q', '-o', archivePath, '-d', outDir], { stdio: 'inherit' });
      return;
    } catch (e) {
      errors.push(`unzip: ${e instanceof Error ? e.message : e}`);
    }
    try {
      execFileSync('python3', ['-m', 'zipfile', '-e', archivePath, outDir], { stdio: 'inherit' });
      return;
    } catch (e) {
      errors.push(`python3 zipfile: ${e instanceof Error ? e.message : e}`);
    }
    try {
      execFileSync('tar', ['-xf', archivePath, '-C', outDir], { stdio: 'inherit' });
      return;
    } catch (e) {
      errors.push(`tar: ${e instanceof Error ? e.message : e}`);
    }
    throw new Error(`解压 zip 失败 (${archivePath}):\n  ${errors.join('\n  ')}`);
  }

  // tar.gz / tar: GNU tar / bsdtar 均原生支持
  execFileSync('tar', ['-xf', archivePath, '-C', outDir], { stdio: 'inherit' });
}

function findFile(root, name) {
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop();
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.name === name) return full;
    }
  }
  return null;
}

export async function fetchOne(key, spec, platformDir) {
  const asset = await latestAsset(spec.owner, spec.repo, spec.match);
  log(`${key}: ${asset.tag} → ${asset.name}`);
  const tmp = mkdtempSync(join(tmpdir(), `secbot-${key}-`));
  try {
    const archivePath = join(tmp, asset.name);
    await download(asset.url, archivePath);
    const extractDir = join(tmp, 'out');
    extractArchive(archivePath, extractDir);
    const found = findFile(extractDir, spec.bin);
    if (!found) throw new Error(`解压后未找到 ${spec.bin}`);
    const destDir = join(repoRoot, 'tools', platformDir);
    mkdirSync(destDir, { recursive: true });
    const dest = join(destDir, spec.bin);
    copyFileSync(found, dest);
    if (process.platform !== 'win32') chmodSync(dest, 0o755);
    log(`已写入 ${dest}`);
    return { tool: key, tag: asset.tag, path: dest };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

export async function main(targetLabel) {
  const label = (targetLabel || process.argv[2] || inferLabel()).trim();
  const platformSpec = SPEC[label];
  if (!platformSpec) {
    throw new Error(`未知平台: ${label}`);
  }
  const destDir = join(repoRoot, 'tools', platformSpec.dir);
  mkdirSync(destDir, { recursive: true });
  const results = [];
  for (const key of ['nuclei', 'ffuf']) {
    results.push(await fetchOne(key, platformSpec[key], platformSpec.dir));
  }
  writeFileSync(
    join(destDir, 'manifest.json'),
    `${JSON.stringify({ platform: label, fetchedAt: new Date().toISOString(), tools: results }, null, 2)}\n`,
  );
  log(`完成 → ${destDir}`);
  if (
    !existsSync(join(destDir, platformSpec.nuclei.bin)) ||
    !existsSync(join(destDir, platformSpec.ffuf.bin))
  ) {
    throw new Error('产物校验失败');
  }
}

const isEntrypoint =
  process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isEntrypoint) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
