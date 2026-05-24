import { useState } from 'react'
import type { StreamTimelineItem } from '@/lib/types'

interface Props { item: StreamTimelineItem }

export function ThoughtBlock({ item }: Props) {
  const [expanded, setExpanded] = useState(true)
  const isRunning = item.status === 'running'

  return (
    <div className="animate-fade-in-up">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-xs text-text-dim hover:text-text transition-colors w-full text-left"
      >
        <span className={`w-2 h-2 rounded-full ${isRunning ? 'bg-secondary animate-pulse' : 'bg-white/20'}`} />
        <span className="font-mono">{item.title || `Thinking #${item.iteration ?? ''}`}</span>
        <span className="text-white/30 ml-auto">{expanded ? '▼' : '▶'}</span>
      </button>
      {expanded && (
        <div className="mt-2 ml-4 pl-3 border-l border-white/10 text-xs text-text-dim font-mono whitespace-pre-wrap">
          {item.body}
        </div>
      )}
    </div>
  )
}
