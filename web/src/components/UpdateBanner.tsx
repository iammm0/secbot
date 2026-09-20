import { useEffect, useState } from 'react'
import {
  checkDesktopUpdates,
  dismissUpdate,
  getDismissedUpdateTag,
  shouldAutoCheckUpdates,
  type UpdateCheckResult,
} from '@/lib/updateCheck'

export function UpdateBanner() {
  const [update, setUpdate] = useState<UpdateCheckResult | null>(null)

  useEffect(() => {
    let cancelled = false
    if (!shouldAutoCheckUpdates()) return
    void checkDesktopUpdates({ includePrerelease: true }).then((result) => {
      if (cancelled) return
      if (
        result.updateAvailable &&
        result.latestTag &&
        getDismissedUpdateTag() !== result.latestTag
      ) {
        setUpdate(result)
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  if (!update?.updateAvailable || !update.latestVersion) return null

  return (
    <div className="relative z-[70] flex items-center justify-between gap-3 border-b border-primary/30 bg-primary/10 px-4 py-2 text-xs">
      <div className="min-w-0 font-mono text-primary">
        新版本已发布：{update.latestVersion}
        <span className="ml-2 text-text-dim">当前 {update.currentVersion}</span>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {update.htmlUrl ? (
          <a
            href={update.htmlUrl}
            target="_blank"
            rel="noreferrer"
            className="rounded border border-primary/40 bg-primary/15 px-2 py-1 font-mono text-primary hover:bg-primary/25"
          >
            查看
          </a>
        ) : null}
        <button
          type="button"
          className="rounded px-2 py-1 font-mono text-text-dim hover:text-text"
          onClick={() => {
            if (update.latestTag) dismissUpdate(update.latestTag)
            setUpdate(null)
          }}
        >
          关闭
        </button>
      </div>
    </div>
  )
}
