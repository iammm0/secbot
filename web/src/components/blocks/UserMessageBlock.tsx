import { formatElapsed } from '@/lib/formatElapsed'

interface Props {
  message: string
  durationMs?: number | null
}

export function UserMessageBlock({ message, durationMs }: Props) {
  return (
    <div className="flex justify-end animate-fade-in-up">
      <div className="max-w-[80%] px-4 py-2.5 rounded-2xl rounded-br-sm bg-primary/10 border border-primary/20 text-sm font-mono text-text">
        {message}
        {durationMs != null && durationMs > 0 ? (
          <div className="mt-1 text-right text-[10px] text-text-dim tabular-nums">
            用时 {formatElapsed(durationMs)}
          </div>
        ) : null}
      </div>
    </div>
  )
}
