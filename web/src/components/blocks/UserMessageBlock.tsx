import { formatElapsed } from '@/lib/formatElapsed'
import { MessageActions } from '@/components/MessageActions'

interface Props {
  message: string
  durationMs?: number | null
}

export function UserMessageBlock({ message, durationMs }: Props) {
  return (
    <div className="flex justify-end animate-fade-in-up">
      <MessageActions content={message} quoteLabel="用户" align="right" className="max-w-[80%] pb-2">
        <div className="whitespace-pre-wrap rounded-2xl rounded-br-sm border border-primary/20 bg-primary/10 px-4 py-2.5 font-mono text-sm text-text">
          {message}
          {durationMs != null && durationMs > 0 ? (
            <div className="mt-1 text-right text-[10px] tabular-nums text-text-dim">
              用时 {formatElapsed(durationMs)}
            </div>
          ) : null}
        </div>
      </MessageActions>
    </div>
  )
}
