import { formatElapsed } from '@/lib/formatElapsed'

interface Props {
  phase?: string
  detail?: string
  elapsedMs?: number
}

export function LoadingBar({ phase, detail, elapsedMs = 0 }: Props) {
  return (
    <div className="relative h-1 w-full overflow-hidden bg-hover">
      <div className="absolute inset-0 w-1/3 bg-gradient-to-r from-transparent via-primary/60 to-transparent animate-[loading-slide_1.5s_ease-in-out_infinite]" />
      {(phase || detail || elapsedMs > 0) && (
        <div className="absolute top-2 left-4 z-10 flex items-center gap-2 text-xs text-text-dim font-mono">
          <span>
            {phase}
            {detail ? ` · ${detail}` : ''}
          </span>
          {elapsedMs > 0 ? (
            <span className="tabular-nums text-warning">{formatElapsed(elapsedMs)}</span>
          ) : null}
        </div>
      )}
    </div>
  )
}
