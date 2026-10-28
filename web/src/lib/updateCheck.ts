import {
  DESKTOP_TAG_PREFIX,
  DESKTOP_VERSION,
  GITHUB_REPO,
} from '@/generated/desktopVersion'
import { compareSemVer, versionFromDesktopTag } from '@/lib/semver'
import { isTauriRuntime } from '@/lib/petWindow'

export type UpdateCheckResult = {
  currentVersion: string
  latestVersion: string | null
  latestTag: string | null
  releaseUrl: string | null
  htmlUrl: string | null
  publishedAt: string | null
  updateAvailable: boolean
  checkedAt: number
  error?: string
}

const DISMISS_KEY = 'secbot-update-dismissed-tag'
const LAST_CHECK_KEY = 'secbot-update-last-check'
const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000

export function getCurrentDesktopVersion(): string {
  const fromEnv = import.meta.env.VITE_SECBOT_DESKTOP_VERSION?.trim()
  return fromEnv || DESKTOP_VERSION
}

export function getDismissedUpdateTag(): string | null {
  try {
    return localStorage.getItem(DISMISS_KEY)
  } catch {
    return null
  }
}

export function dismissUpdate(tag: string) {
  try {
    localStorage.setItem(DISMISS_KEY, tag)
  } catch {
    /* ignore */
  }
}

export function shouldAutoCheckUpdates(): boolean {
  try {
    const raw = localStorage.getItem(LAST_CHECK_KEY)
    if (!raw) return true
    const last = Number(raw)
    if (!Number.isFinite(last)) return true
    return Date.now() - last >= CHECK_INTERVAL_MS
  } catch {
    return true
  }
}

function markChecked() {
  try {
    localStorage.setItem(LAST_CHECK_KEY, String(Date.now()))
  } catch {
    /* ignore */
  }
}

type GhRelease = {
  tag_name?: string
  html_url?: string
  published_at?: string
  prerelease?: boolean
  draft?: boolean
  assets?: Array<{ browser_download_url?: string; name?: string }>
}

export async function checkDesktopUpdates(options?: {
  includePrerelease?: boolean
  force?: boolean
}): Promise<UpdateCheckResult> {
  const currentVersion = getCurrentDesktopVersion()
  const includePrerelease = options?.includePrerelease ?? true
  const base: UpdateCheckResult = {
    currentVersion,
    latestVersion: null,
    latestTag: null,
    releaseUrl: null,
    htmlUrl: null,
    publishedAt: null,
    updateAvailable: false,
    checkedAt: Date.now(),
  }

  try {
    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases?per_page=30`, {
      headers: { Accept: 'application/vnd.github+json' },
    })
    if (!res.ok) {
      markChecked()
      return { ...base, error: `GitHub API ${res.status}` }
    }
    const releases = (await res.json()) as GhRelease[]
    const candidates = releases
      .filter((r) => !r.draft)
      .filter((r) => includePrerelease || !r.prerelease)
      .map((r) => {
        const tag = r.tag_name ?? ''
        const version = versionFromDesktopTag(tag, DESKTOP_TAG_PREFIX)
        return version
          ? {
              tag,
              version,
              htmlUrl: r.html_url ?? null,
              publishedAt: r.published_at ?? null,
            }
          : null
      })
      .filter(Boolean) as Array<{
      tag: string
      version: string
      htmlUrl: string | null
      publishedAt: string | null
    }>

    candidates.sort((a, b) => compareSemVer(b.version, a.version))
    const latest = candidates[0]
    markChecked()
    if (!latest) {
      return { ...base, error: '暂无 desktop-app 发布' }
    }

    const updateAvailable = compareSemVer(latest.version, currentVersion) > 0
    return {
      ...base,
      latestVersion: latest.version,
      latestTag: latest.tag,
      htmlUrl: latest.htmlUrl,
      releaseUrl: latest.htmlUrl,
      publishedAt: latest.publishedAt,
      updateAvailable,
    }
  } catch (err) {
    markChecked()
    return {
      ...base,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

// ── 桌面端应用内下载并安装（tauri-plugin-updater） ─────────────────────────────

export type UpdateProgressEvent = {
  kind: 'started' | 'progress' | 'finished' | 'error'
  message?: string
  current?: number
  total?: number
}

export function isMacDesktop(): boolean {
  return /Mac/i.test(navigator.userAgent)
}

/**
 * 通过 tauri-plugin-updater 下载并安装新版桌面应用（仅 Windows 自动安装；
 * macOS 未签名构建会受限，UI 侧改为跳转发布页手动下载）。
 */
export async function downloadAndInstallDesktopUpdate(
  onEvent?: (ev: UpdateProgressEvent) => void,
): Promise<void> {
  if (!isTauriRuntime()) {
    throw new Error('当前运行在浏览器中，无法应用内安装更新')
  }
  onEvent?.({ kind: 'started', message: '开始检查更新…' })
  const { check } = await import('@tauri-apps/plugin-updater')
  const update = await check()
  if (!update) {
    onEvent?.({ kind: 'finished', message: '已是最新版本' })
    return
  }
  onEvent?.({ kind: 'started', message: `发现新版本 ${update.version}，开始下载…` })

  let downloaded = 0
  let total: number | undefined
  await update.download((event) => {
    if (event.event === 'Started') {
      total = event.data.contentLength
    } else if (event.event === 'Progress') {
      downloaded += event.data.chunkLength
      onEvent?.({ kind: 'progress', current: downloaded, total })
    }
  })
  onEvent?.({ kind: 'progress', current: downloaded, total })
  onEvent?.({ kind: 'started', message: '下载完成，开始安装…' })
  await update.install()
  onEvent?.({ kind: 'finished', message: '安装完成，应用将重启' })
}
