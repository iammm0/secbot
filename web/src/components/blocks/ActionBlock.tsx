import type { StreamTimelineItem } from '@/lib/types'
import { formatToolArg, peekableOutput, rawOutputText } from '@/lib/foldOutput'
import { CollapsibleOutput } from './CollapsibleOutput'

interface Props { item: StreamTimelineItem }

export function ActionBlock({ item }: Props) {
  const running = item.status === 'running'
  const ok = item.success !== false
  const subtitle = formatToolArg(item.params)
  const full = peekableOutput(rawOutputText(item.result, item.body))

  return (
    <CollapsibleOutput
      title={item.tool || item.title || '工具'}
      subtitle={subtitle}
      status={running ? 'running' : 'done'}
      success={ok}
    >
      <div className="glass-card overflow-x-auto p-3 font-mono text-xs text-text-dim">
        {subtitle && item.tool === 'execute_command' ? (
          <div className="mb-2 text-secondary/80">$ {subtitle}</div>
        ) : null}
        <pre className="whitespace-pre-wrap">{full || item.body || '执行中'}</pre>
      </div>
    </CollapsibleOutput>
  )
}
