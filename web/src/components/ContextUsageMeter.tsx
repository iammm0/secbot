import { useEffect, useRef, useState } from 'react'
import type { ContextUsagePart, ContextUsageSnapshot } from '@/lib/types'
import { formatTokenCount } from '@/lib/formatTokens'

const PART_COLORS: Record<string, string> = {
  system: '#71717a',
  tools: '#a78bfa',
  skills: '#4ade80',
  mcp: '#c084fc',
  pinned: '#f472b6',
  conversation: '#f97316',
  history: '#00d4ff',
  memory: '#00ff88',
  user: '#fbbf24',
}

function partColor(id: string, index: number): string {
  if (PART_COLORS[id]) return PART_COLORS[id]
  const fallback = ['#64748b', '#38bdf8', '#fb7185', '#34d399']
  return fallback[index % fallback.length]
}

function fillColor(ratio: number): string {
  if (ratio > 0.8) return 'var(--color-error)'
  if (ratio > 0.6) return 'var(--color-warning)'
  return 'var(--color-primary)'
}

interface Props {
  usage: ContextUsageSnapshot | null
  compact?: boolean
}

export function ContextUsageMeter({ usage, compact = false }: Props) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const pct = usage ? Math.round(Math.min(1, Math.max(0, usage.ratio)) * 100) : null
  const windowSize = usage
    ? usage.contextWindow > 0
      ? usage.contextWindow
      : usage.promptBudget
    : 0
  const parts = usage?.parts ?? []
  const used = parts.reduce((sum, part) => sum + part.tokens, 0) || usage?.usedTokens || 0

  useEffect(() => {
    if (!open) return
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={`flex items-center gap-1.5 rounded-full border border-border/80 bg-hover/60 font-mono text-[10px] text-text-dim transition-colors hover:border-primary/30 hover:text-text ${
          compact ? 'px-2 py-1' : 'px-1.5 py-0.5'
        }`}
        aria-expanded={open}
        title="查看上下文组成"
      >
        <span className="hidden sm:inline">{usage?.model ? shortModel(usage.model) : 'ctx'}</span>
        <StackedBar parts={parts} ratio={usage?.ratio ?? 0} compact />
        <span className="tabular-nums">{pct == null ? '--' : `${pct}%`}</span>
      </button>
      {open ? (
        <div className="absolute right-0 bottom-full z-40 mb-2 w-[22rem] max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-border bg-popover p-4 shadow-xl animate-fade-in-up">
          {usage ? (
            <>
              <div className="mb-3 flex items-start justify-between gap-3">
                <div>
                  <div className="text-sm font-medium text-text">Context Usage</div>
                  <div className="mt-0.5 text-[11px] text-text-dim">{pct}% Full</div>
                </div>
                <div className="font-mono text-[11px] text-text-dim">
                  ~{formatTokenCount(used)} / {formatTokenCount(windowSize)} Tokens
                </div>
              </div>
              <StackedBar parts={parts} ratio={usage.ratio} />
              {parts.length > 0 ? (
                <ul className="mt-3 space-y-1.5">
                  {parts.map((part, index) => (
                    <li key={part.id} className="flex items-center gap-2 text-[12px] text-text">
                      <span
                        className="h-2 w-2 shrink-0 rounded-sm"
                        style={{ background: partColor(part.id, index) }}
                      />
                      <span className="min-w-0 flex-1 truncate">{part.label}</span>
                      <span className="font-mono text-text-dim">{formatTokenCount(part.tokens)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-3 text-[12px] text-text-dim">本轮尚未拆出分段用量。</p>
              )}
            </>
          ) : (
            <p className="text-[12px] text-text-dim">发送消息后会显示本轮上下文占用。</p>
          )}
        </div>
      ) : null}
    </div>
  )
}

function shortModel(name: string): string {
  if (name.length <= 16) return name
  return `${name.slice(0, 8)}…${name.slice(-6)}`
}

function StackedBar({
  parts,
  ratio,
  compact = false,
}: {
  parts: ContextUsagePart[]
  ratio: number
  compact?: boolean
}) {
  const total = parts.reduce((sum, part) => sum + part.tokens, 0)
  const usedWidth = `${Math.round(Math.min(1, Math.max(0, ratio)) * 100)}%`
  return (
    <div
      className={`overflow-hidden rounded-full bg-hover ${compact ? 'h-1.5 w-12' : 'h-2 w-full'}`}
    >
      {parts.length > 0 && total > 0 ? (
        <div className="flex h-full" style={{ width: usedWidth }}>
          {parts.map((part, index) => (
            <div
              key={part.id}
              className="h-full min-w-px"
              style={{
                width: `${(part.tokens / total) * 100}%`,
                background: partColor(part.id, index),
              }}
            />
          ))}
        </div>
      ) : (
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: usedWidth, background: fillColor(ratio) }}
        />
      )}
    </div>
  )
}
