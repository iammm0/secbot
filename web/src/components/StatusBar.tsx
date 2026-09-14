import type { ContextUsageSnapshot } from '@/lib/types'
import { ContextUsageMeter } from '@/components/ContextUsageMeter'

interface Props {
  contextUsage: ContextUsageSnapshot | null
  phase?: string
}

export function StatusBar({ contextUsage, phase }: Props) {
  return (
    <div className="flex items-center justify-between px-4 py-2 border-t border-border text-xs text-text-dim font-mono">
      <div className="flex items-center gap-3">
        <img
          src="/secbot-icon.png"
          alt="SecBot"
          className="h-4 w-4 object-contain"
        />
        {phase && <span className="text-secondary">{phase}</span>}
      </div>
      {contextUsage ? <ContextUsageMeter usage={contextUsage} /> : null}
    </div>
  )
}
