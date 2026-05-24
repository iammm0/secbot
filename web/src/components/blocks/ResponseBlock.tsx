import type { StreamTimelineItem } from '@/lib/types'
import Markdown from 'react-markdown'

interface Props { item: StreamTimelineItem }

export function ResponseBlock({ item }: Props) {
  const isObservation = item.type === 'observation'

  return (
    <div className={`animate-fade-in-up ${isObservation ? 'ml-4 border-l-2 border-white/10 pl-4' : ''}`}>
      {isObservation && <div className="text-xs text-text-dim font-mono mb-1">{item.title}</div>}
      <div className="prose prose-invert prose-sm max-w-none font-mono text-sm leading-relaxed [&_pre]:glass-card [&_pre]:p-3 [&_code]:text-secondary [&_a]:text-primary [&_h1]:text-primary [&_h1]:text-lg [&_h1]:border-b [&_h1]:border-white/10 [&_h1]:pb-2 [&_h2]:text-secondary [&_h2]:text-base [&_h3]:text-accent [&_h3]:text-sm [&_ul]:list-disc [&_ul]:ml-4 [&_ol]:list-decimal [&_ol]:ml-4 [&_li]:my-1 [&_p]:my-2 [&_blockquote]:border-l-2 [&_blockquote]:border-primary/40 [&_blockquote]:pl-3 [&_blockquote]:text-text-dim">
        <Markdown>{item.body}</Markdown>
      </div>
    </div>
  )
}
