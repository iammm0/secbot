import {
  DESKTOP_TAG_PREFIX,
  DESKTOP_VERSION,
  GITHUB_REPO,
} from '@/generated/desktopVersion'
import { compareSemVer, versionFromDesktopTag } from '@/lib/semver'

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
