import { useState } from 'react'
import type { StreamTimelineItem } from '@/lib/types'
import { Icon } from '@/components/Icon'
import { MarkdownBody } from '@/components/MarkdownBody'

interface Props { item: StreamTimelineItem }

export function ReportBlock({ item }: Props) {
  const [expanded, setExpanded] = useState(true)

  return (
    <div className="glass-card animate-fade-in-up border-accent/20 p-4">
      <button onClick={() => setExpanded(!expanded)} className="mb-2 flex w-full items-center gap-2 text-left">
        <span className="text-xs font-semibold uppercase tracking-wider text-accent">安全报告</span>
        <Icon
          name="arrow-right-02"
          size={12}
          className={`ml-auto text-text-dim transition-transform ${expanded ? 'rotate-90' : ''}`}
        />
      </button>
      {expanded && <MarkdownBody>{item.body}</MarkdownBody>}
    </div>
  )
}
