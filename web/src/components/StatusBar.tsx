import type { ContextUsageSnapshot } from '@/lib/types'

interface Props {
  contextUsage: ContextUsageSnapshot | null
  phase?: string
}

export function StatusBar({ contextUsage, phase }: Props) {
  return (
    <div className="flex items-center justify-between px-4 py-2 border-t border-white/5 text-xs text-text-dim font-mono">
      <div className="flex items-center gap-3">
        <span className="text-primary font-semibold">SECBOT</span>
        {phase && <span className="text-secondary">{phase}</span>}
      </div>
      {contextUsage && (
        <div className="flex items-center gap-2">
          <span>{contextUsage.model ?? 'unknown'}</span>
          <div className="w-16 h-1.5 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${Math.round(contextUsage.ratio * 100)}%`,
                background: contextUsage.ratio > 0.8 ? '#ff4444' : contextUsage.ratio > 0.6 ? '#fbbf24' : '#00ff88',
              }}
            />
          </div>
          <span>{Math.round(contextUsage.ratio * 100)}%</span>
        </div>
      )}
    </div>
  )
}
