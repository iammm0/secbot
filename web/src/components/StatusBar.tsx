import { formatElapsed } from '@/lib/formatElapsed'

interface Props {
  phase?: string
  elapsedMs?: number
  busy?: boolean
}

/** Keep in sync with Sidebar settings footer (`h-10`) so the dividers align. */
export function StatusBar({ phase, elapsedMs = 0, busy = false }: Props) {
  return (
    <div className="flex h-10 shrink-0 items-center justify-between border-t border-border px-4 text-xs text-text-dim font-mono">
      <div className="flex items-center gap-3">
        {phase ? <span className="text-secondary">{phase}</span> : <span>ready</span>}
        {(busy || elapsedMs > 0) && elapsedMs > 0 ? (
          <span className={`tabular-nums ${busy ? 'text-warning' : 'text-text-dim'}`}>
            {formatElapsed(elapsedMs)}
          </span>
        ) : null}
      </div>
    </div>
  )
}
