import type { StreamTimelineItem } from '@/lib/types'
import { MarkdownBody } from '@/components/MarkdownBody'
import { MessageActions } from '@/components/MessageActions'

interface Props { item: StreamTimelineItem }

export function ResponseBlock({ item }: Props) {
  return (
    <MessageActions
      content={item.body}
      quoteLabel="Secbot"
      blockId={item.id}
      className="animate-fade-in-up pb-2"
    >
      <MarkdownBody>{item.body}</MarkdownBody>
    </MessageActions>
  )
}
