import type { StreamTimelineItem } from '@/lib/types'
import { presentThought } from '@/lib/foldOutput'
import { MarkdownBody } from '@/components/MarkdownBody'
import { TraceBlock } from './TraceBlock'

interface Props { item: StreamTimelineItem }

export function ThoughtBlock({ item }: Props) {
  const running = item.status === 'running'
  const prose = presentThought(item.body)
  const preview = prose.replace(/\s+/g, ' ').trim()

  return (
    <TraceBlock
      kind="推理"
      detail={preview.length > 64 ? `${preview.slice(0, 64)}…` : preview}
      status={running ? 'running' : 'done'}
    >
      {prose ? <MarkdownBody className="md-compact">{prose}</MarkdownBody> : null}
    </TraceBlock>
  )
}
