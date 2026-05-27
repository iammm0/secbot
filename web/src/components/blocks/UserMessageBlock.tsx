interface Props {
  message: string
}

export function UserMessageBlock({ message }: Props) {
  return (
    <div className="flex justify-end animate-fade-in-up">
      <div className="max-w-[80%] px-4 py-2.5 rounded-2xl rounded-br-sm bg-primary/10 border border-primary/20 text-sm font-mono text-text">
        {message}
      </div>
    </div>
  )
}
