interface Props { message: string }

export function ErrorBlock({ message }: Props) {
  return (
    <div className="glass-card border-error/30 p-4 animate-fade-in-up">
      <div className="flex items-center gap-2 text-error text-sm font-mono">
        <span className="text-lg">⚠</span>
        <span className="whitespace-pre-wrap">{message}</span>
      </div>
    </div>
  )
}
