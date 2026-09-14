import { useState, type ReactNode } from 'react'
import { Icon } from '@/components/Icon'

interface Props {
  title: string
  subtitle?: string
  status?: 'running' | 'done'
  success?: boolean
  preview?: string
  hiddenLines?: number
  /** Running tools stay open until they finish, unless the user toggles. */
  autoExpandWhenRunning?: boolean
  children: ReactNode
}

export function CollapsibleOutput({
  title,
  subtitle,
  status = 'done',
  success = true,
  preview,
  hiddenLines = 0,
  autoExpandWhenRunning = true,
  children,
}: Props) {
  const [override, setOverride] = useState<boolean | null>(null)
  const running = status === 'running'
  const expanded = override ?? (autoExpandWhenRunning && running)

  const dotClass = running
    ? 'bg-warning animate-pulse'
    : success
      ? 'bg-primary'
      : 'bg-error'

  return (
    <div className="animate-fade-in-up">
      <button
        type="button"
        onClick={() => setOverride(!expanded)}
        className="flex w-full items-center gap-2 text-left text-xs text-text-dim transition-colors hover:text-text"
        aria-expanded={expanded}
      >
        <Icon
          name="arrow-right-02"
          size={12}
          className={`shrink-0 text-text-dim transition-transform ${expanded ? 'rotate-90' : ''}`}
        />
        <span className={`h-2 w-2 shrink-0 rounded-full ${dotClass}`} />
        <span className="font-mono text-secondary">{title}</span>
        {subtitle ? (
          <span className="min-w-0 flex-1 truncate font-mono text-text-dim/80">{subtitle}</span>
        ) : (
          <span className="flex-1" />
        )}
      </button>

      {!expanded && preview ? (
        <pre className="ml-7 mt-1 max-h-16 overflow-hidden whitespace-pre-wrap font-mono text-[11px] leading-4 text-text-dim/70">
          {preview}
        </pre>
      ) : null}

      {!expanded && hiddenLines > 0 ? (
        <div className="ml-7 mt-0.5 font-mono text-[11px] text-text-dim">另有 {hiddenLines} 行</div>
      ) : null}

      {expanded ? <div className="mt-2 ml-7">{children}</div> : null}
    </div>
  )
}
