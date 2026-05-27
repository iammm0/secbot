import { useState } from 'react'
import type { StreamTimelineItem } from '@/lib/types'

interface Props { item: StreamTimelineItem }

export function ActionBlock({ item }: Props) {
  const [expanded, setExpanded] = useState(true)
  const isRunning = item.status === 'running'
  const ok = item.success !== false

  return (
    <div className="animate-fade-in-up">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-xs w-full text-left"
      >
        <span className={`w-2 h-2 rounded-full ${isRunning ? 'bg-warning animate-pulse' : ok ? 'bg-primary' : 'bg-error'}`} />
        <span className="font-mono text-secondary">{item.tool}</span>
        {item.params && <span className="text-text-dim truncate max-w-[200px]">{JSON.stringify(item.params).slice(0, 60)}</span>}
        <span className="text-white/30 ml-auto">{expanded ? '▼' : '▶'}</span>
      </button>
      {expanded && (
        <div className="mt-2 ml-4 glass-card p-3 text-xs font-mono text-text-dim overflow-x-auto">
          <pre className="whitespace-pre-wrap">{item.body || JSON.stringify(item.result ?? item.params, null, 2)}</pre>
        </div>
      )}
    </div>
  )
}
