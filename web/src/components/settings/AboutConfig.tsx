import { useCallback, useEffect, useState } from 'react'
import {
  checkDesktopUpdates,
  dismissUpdate,
  getCurrentDesktopVersion,
  getDismissedUpdateTag,
  type UpdateCheckResult,
} from '@/lib/updateCheck'
import { DESKTOP_RELEASE_TAG, DESKTOP_TAG_PREFIX, GITHUB_REPO } from '@/generated/desktopVersion'

export function AboutConfig() {
  const current = getCurrentDesktopVersion()
  const [result, setResult] = useState<UpdateCheckResult | null>(null)
  const [checking, setChecking] = useState(false)

  const runCheck = useCallback(async (force = true) => {
    setChecking(true)
    try {
      const next = await checkDesktopUpdates({ force, includePrerelease: true })
      setResult(next)
    } finally {
      setChecking(false)
    }
  }, [])

  useEffect(() => {
    void runCheck(true)
  }, [runCheck])

  const updateVisible =
    result?.updateAvailable &&
    result.latestTag &&
    getDismissedUpdateTag() !== result.latestTag

  return (
    <div className="space-y-6">
      <div>
        <h3 className="mb-3 text-xs uppercase tracking-wider text-text-dim">版本</h3>
        <div className="rounded-lg border border-border bg-hover px-4 py-3 font-mono text-sm">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <div>
              <div className="text-text-dim text-[11px]">当前桌面端</div>
              <div className="mt-1 text-lg text-primary">{current}</div>
            </div>
            <div className="text-right text-[11px] text-text-dim">
              <div>发布标签</div>
              <div className="mt-1 text-text">{DESKTOP_RELEASE_TAG}</div>
            </div>
          </div>
          <div className="mt-3 text-[11px] text-text-dim">
            仓库{' '}
            <a
              className="text-secondary hover:underline"
              href={`https://github.com/${GITHUB_REPO}`}
              target="_blank"
              rel="noreferrer"
            >
              {GITHUB_REPO}
            </a>
            · 标签前缀 <span className="text-text">{DESKTOP_TAG_PREFIX}*</span>
          </div>
        </div>
      </div>

      <div>
        <h3 className="mb-3 text-xs uppercase tracking-wider text-text-dim">更新</h3>
        <div className="space-y-3 rounded-lg border border-border bg-hover px-4 py-3">
          {checking && !result ? (
            <div className="font-mono text-xs text-text-dim">正在检查更新…</div>
          ) : null}

          {result?.error ? (
            <div className="font-mono text-xs text-warning">{result.error}</div>
          ) : null}

          {result && !result.error && !result.updateAvailable ? (
            <div className="font-mono text-xs text-text">
              已是最新
              {result.latestVersion ? (
                <span className="text-text-dim">（远端 {result.latestVersion}）</span>
              ) : null}
            </div>
          ) : null}

          {updateVisible ? (
            <div className="space-y-2">
              <div className="font-mono text-sm text-primary">
                发现新版本 {result!.latestVersion}
              </div>
              <div className="text-[11px] text-text-dim">
                标签 {result!.latestTag}
                {result!.publishedAt
                  ? ` · ${new Date(result!.publishedAt).toLocaleString()}`
                  : null}
              </div>
              <div className="flex flex-wrap gap-2 pt-1">
                {result!.htmlUrl ? (
                  <a
                    href={result!.htmlUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded border border-primary/40 bg-primary/15 px-3 py-1.5 font-mono text-xs text-primary"
                  >
                    查看发布页
                  </a>
                ) : null}
                <button
                  type="button"
                  className="rounded border border-border px-3 py-1.5 font-mono text-xs text-text-dim hover:text-text"
                  onClick={() => {
                    if (result?.latestTag) dismissUpdate(result.latestTag)
                    setResult({ ...result!, updateAvailable: false })
                  }}
                >
                  稍后提醒
                </button>
              </div>
            </div>
          ) : null}

          <button
            type="button"
            disabled={checking}
            onClick={() => void runCheck(true)}
            className="rounded border border-border px-3 py-1.5 font-mono text-xs text-text-dim hover:border-primary/40 hover:text-text disabled:opacity-50"
          >
            {checking ? '检查中…' : '检查更新'}
          </button>
        </div>
      </div>
    </div>
  )
}
