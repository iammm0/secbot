import type { StreamTimelineItem } from '@/lib/types'
import { MarkdownBody } from '@/components/MarkdownBody'

interface Props { item: StreamTimelineItem }

export function ResponseBlock({ item }: Props) {
  return (
    <div className="animate-fade-in-up">
      <MarkdownBody>{item.body}</MarkdownBody>
    </div>
  )
}
