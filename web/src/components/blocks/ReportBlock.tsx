import { useState } from 'react'
import type { StreamTimelineItem } from '@/lib/types'
import Markdown from 'react-markdown'

interface Props { item: StreamTimelineItem }

export function ReportBlock({ item }: Props) {
  const [expanded, setExpanded] = useState(true)

  return (
    <div className="glass-card p-4 animate-fade-in-up border-accent/20">
      <button onClick={() => setExpanded(!expanded)} className="flex items-center gap-2 w-full text-left mb-2">
        <span className="text-accent text-xs font-semibold uppercase tracking-wider">Security Report</span>
        <span className="text-white/30 ml-auto text-xs">{expanded ? '▼' : '▶'}</span>
      </button>
      {expanded && (
        <div className="prose prose-invert prose-sm max-w-none font-mono text-sm [&_pre]:glass-card [&_pre]:p-3 [&_code]:text-secondary [&_a]:text-primary [&_h1]:text-primary [&_h2]:text-secondary [&_h3]:text-accent">
          <Markdown>{item.body}</Markdown>
        </div>
      )}
    </div>
  )
}
