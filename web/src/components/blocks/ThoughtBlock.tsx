import { useState } from 'react'
import type { StreamTimelineItem } from '@/lib/types'
import { Icon } from '@/components/Icon'
import { MarkdownBody } from '@/components/MarkdownBody'

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
        <span className={`w-2 h-2 rounded-full ${isRunning ? 'bg-secondary animate-pulse' : 'bg-text-dim/40'}`} />
        <span className="font-mono">{item.title || `思考 #${item.iteration ?? ''}`}</span>
        <Icon
          name="arrow-right-02"
          size={12}
          className={`ml-auto text-text-dim transition-transform ${expanded ? 'rotate-90' : ''}`}
        />
      </button>
      {expanded && (
        <div className="mt-2 ml-4 border-l border-border pl-3">
          <MarkdownBody className="md-compact">{item.body}</MarkdownBody>
        </div>
      )}
    </div>
  )
}
