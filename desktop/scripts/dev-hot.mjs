#!/usr/bin/env node
/**
 * Desktop hot-dev: tsc --watch + Vite HMR + tauri dev.
 * Frontend loads from Vite (5173); API proxies to Nest (8000).
 */
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import net from 'node:net'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const desktopDir = path.resolve(__dirname, '..')
const rootDir = path.resolve(desktopDir, '..')
const webDir = path.join(rootDir, 'web')
const vitePort = Number(process.env.SECBOT_DESKTOP_VITE_PORT || 5173)

const children = []

function run(command, args, cwd, name) {
  const child = spawn(command, args, {
    cwd,
    stdio: 'inherit',
    env: process.env,
    shell: process.platform === 'win32',
  })
  child.on('exit', (code, signal) => {
    if (shuttingDown) return
    console.error(`[dev-hot] ${name} exited code=${code} signal=${signal}`)
    shutdown(code ?? 1)
  })
  children.push(child)
  return child
}

function runOnce(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      stdio: 'inherit',
      env: process.env,
      shell: process.platform === 'win32',
    })
    child.on('exit', (code) => {
      if (code === 0) resolve()
      else reject(new Error(`${command} ${args.join(' ')} failed with ${code}`))
    })
  })
}

function waitForPort(port, timeoutMs) {
  const deadline = Date.now() + timeoutMs
  return new Promise((resolve) => {
    const tryConnect = () => {
      const socket = net.connect({ host: '127.0.0.1', port }, () => {
        socket.end()
        resolve(true)
      })
      socket.on('error', () => {
        socket.destroy()
        if (Date.now() >= deadline) {
          resolve(false)
          return
        }
        setTimeout(tryConnect, 250)
      })
    }
    tryConnect()
  })
}

let shuttingDown = false
function shutdown(code = 0) {
  if (shuttingDown) return
  shuttingDown = true
  for (const child of children) {
    try {
      child.kill('SIGTERM')
    } catch {
      // ignore
    }
  }
  setTimeout(() => process.exit(code), 300)
}

process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))

async function main() {
  console.log('[dev-hot] 首次编译 server…')
  await runOnce('npm', ['run', 'build'], rootDir)

  console.log('[dev-hot] 启动 server tsc --watch')
  run(
    'npx',
    ['tsc', '-p', 'server/tsconfig.json', '--watch', '--preserveWatchOutput'],
    rootDir,
    'tsc',
  )

  console.log(`[dev-hot] 启动 Vite HMR :${vitePort}`)
  run(
    'npm',
    ['run', 'dev', '--', '--host', '127.0.0.1', '--port', String(vitePort), '--strictPort'],
    webDir,
    'vite',
  )

  const viteReady = await waitForPort(vitePort, 60_000)
  if (!viteReady) {
    throw new Error(`Vite 未在 :${vitePort} 就绪`)
  }
  console.log('[dev-hot] Vite 就绪，启动 tauri dev')
  run('npx', ['tauri', 'dev'], desktopDir, 'tauri')
}

main().catch((err) => {
  console.error('[dev-hot]', err)
  shutdown(1)
})
