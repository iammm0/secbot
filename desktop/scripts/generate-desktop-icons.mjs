#!/usr/bin/env node
/**
 * Regenerate desktop Dock icons:
 *  - assets/secbot-desktop-icon.png      (white bg, production)
 *  - assets/secbot-desktop-icon-dev.png  (white bg + DEV badge)
 *  - src-tauri/icons/                    (production bundle)
 *  - src-tauri/icons-dev/                (tauri conf.dev override)
 */
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const desktopDir = path.resolve(__dirname, '..')
const rootDir = path.resolve(desktopDir, '..')
const srcTauri = path.join(desktopDir, 'src-tauri')

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })
  if (result.status !== 0) {
    process.exit(result.status ?? 1)
  }
}

run('python3', [path.join(__dirname, 'generate-desktop-icons.py')], rootDir)

run(
  'npx',
  [
    'tauri',
    'icon',
    path.join(rootDir, 'assets', 'secbot-desktop-icon.png'),
    '-o',
    path.join(srcTauri, 'icons'),
  ],
  desktopDir,
)

run(
  'npx',
  [
    'tauri',
    'icon',
    path.join(rootDir, 'assets', 'secbot-desktop-icon-dev.png'),
    '-o',
    path.join(srcTauri, 'icons-dev'),
  ],
  desktopDir,
)

console.log('Desktop icons regenerated (icons/ + icons-dev/).')
