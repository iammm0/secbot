import type { StreamTimelineItem } from '@/lib/types'
import { readActionCall } from '@/lib/foldOutput'
import { TraceBlock } from './TraceBlock'

interface Props { item: StreamTimelineItem }

export function ActionBlock({ item }: Props) {
  const running = item.status === 'running'
  const ok = item.success !== false
  const call = readActionCall(item)

  return (
    <TraceBlock
      kind="调用"
      label={call.tool === '工具' ? undefined : call.tool}
      detail={item.error || call.arg}
      status={running ? 'running' : 'done'}
      success={ok}
    >
      {call.arg ? <div className="font-mono text-[11px] text-text-dim">{call.arg}</div> : null}
      {item.error ? <div className="mt-1 font-mono text-[11px] text-error">{item.error}</div> : null}
    </TraceBlock>
  )
}
