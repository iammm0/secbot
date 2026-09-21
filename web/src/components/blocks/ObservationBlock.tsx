import type { StreamTimelineItem } from '@/lib/types'
import { presentObservation } from '@/lib/foldOutput'
import { MarkdownBody } from '@/components/MarkdownBody'
import { TraceBlock } from './TraceBlock'

interface Props { item: StreamTimelineItem }

export function ObservationBlock({ item }: Props) {
  const ok = item.success !== false
  const presented = presentObservation(item.result ?? item.body, item.body)
  const summaryOnly = item.result == null && !item.body.trim().startsWith('{') && !item.body.trim().startsWith('[')
  const excerpt =
    presented.excerpt && presented.excerpt.replace(/\s+/g, ' ').trim() !== presented.headline
      ? presented.excerpt
      : ''

  return (
    <TraceBlock
      kind="观察"
      label={item.tool && item.tool !== 'observation' ? item.tool : undefined}
      detail={item.error || presented.headline}
      status={item.status === 'running' ? 'running' : 'done'}
      success={ok}
    >
      {item.error ? <div className="mb-1 font-mono text-[11px] text-error">{item.error}</div> : null}
      {summaryOnly && item.body.includes('**') ? (
        <MarkdownBody className="md-compact">{item.body}</MarkdownBody>
      ) : excerpt ? (
        <pre className="max-h-36 overflow-auto whitespace-pre-wrap font-mono text-[11px] leading-5 text-text-dim">
          {excerpt}
        </pre>
      ) : null}
    </TraceBlock>
  )
}
