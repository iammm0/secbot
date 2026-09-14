import type { StreamTimelineItem } from '@/lib/types'
import { foldText, peekableOutput, rawOutputText } from '@/lib/foldOutput'
import { CollapsibleOutput } from './CollapsibleOutput'
import { MarkdownBody } from '@/components/MarkdownBody'

interface Props { item: StreamTimelineItem }

export function ObservationBlock({ item }: Props) {
  const ok = item.success !== false
  const fullRaw = peekableOutput(rawOutputText(item.result, item.body))
  const folded = foldText(fullRaw || item.body)
  const title = item.tool ? `观察 · ${item.tool}` : item.title || '观察'

  return (
    <CollapsibleOutput
      title={title}
      status={item.status === 'running' ? 'running' : 'done'}
      success={ok}
      preview={folded.preview}
      hiddenLines={folded.hiddenLines}
      autoExpandWhenRunning={false}
    >
      <MarkdownBody>{item.body}</MarkdownBody>
    </CollapsibleOutput>
  )
}
