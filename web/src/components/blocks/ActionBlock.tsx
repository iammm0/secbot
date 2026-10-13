import { useEffect, useState } from 'react'
import type { StreamTimelineItem, ToolProgressSnapshot } from '@/lib/types'
import { formatElapsed } from '@/lib/formatElapsed'
import { progressStatusLabel } from '@/lib/toolProgress'
import { readActionCall } from '@/lib/foldOutput'
import { TraceBlock } from './TraceBlock'

interface Props { item: StreamTimelineItem }

function useLiveElapsed(progress: ToolProgressSnapshot | undefined, active: boolean): number | null {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active || progress?.elapsedMs == null) return
    const timer = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [active, progress?.elapsedMs, progress?.receivedAt])
  if (progress?.elapsedMs == null) return null
  if (!active) return progress.elapsedMs
  return progress.elapsedMs + Math.max(0, now - progress.receivedAt)
}

function progressTone(status: ToolProgressSnapshot['status']): string {
  if (status === 'possibly_stuck' || status === 'failed' || status === 'timed_out') return 'text-error'
  if (status === 'quiet') return 'text-warning'
  return 'text-primary'
}

export function ActionBlock({ item }: Props) {
  const running = item.status === 'running'
  const ok = item.success !== false
  const call = readActionCall(item)
  const elapsed = useLiveElapsed(item.progress, running)
  const progressLabel = item.progress ? progressStatusLabel(item.progress.status) : ''
  const progressLine = item.progress && elapsed != null ? `${formatElapsed(elapsed)} · ${progressLabel}` : ''

  return (
    <TraceBlock
      kind="调用"
      label={call.tool === '工具' ? undefined : call.tool}
      detail={item.error || progressLine || call.arg}
      detailClassName={item.progress && running ? progressTone(item.progress.status) : undefined}
      status={running ? 'running' : 'done'}
      success={ok}
    >
      {call.arg ? <div className="font-mono text-[11px] text-text-dim">{call.arg}</div> : null}
      {item.progress && progressLine ? (
        <div className={`mt-1 font-mono text-[11px] ${progressTone(item.progress.status)}`}>
          <div>{progressLine}</div>
          {item.progress.message ? <div className="text-text-dim">{item.progress.message}</div> : null}
          {item.progress.hint ? <div className="text-text-dim">{item.progress.hint}</div> : null}
          {item.progress.raw ? (
            <pre className="mt-1 max-h-32 overflow-auto whitespace-pre-wrap rounded bg-black/40 p-2 text-[10px] leading-relaxed text-text-dim">
              {item.progress.raw}
            </pre>
          ) : null}
        </div>
      ) : null}
      {item.error ? <div className="mt-1 font-mono text-[11px] text-error">{item.error}</div> : null}
    </TraceBlock>
  )
}
