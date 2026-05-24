interface Props {
  phase?: string
  detail?: string
}

export function LoadingBar({ phase, detail }: Props) {
  return (
    <div className="relative h-1 w-full overflow-hidden bg-white/5">
      <div className="absolute inset-0 w-1/3 bg-gradient-to-r from-transparent via-primary/60 to-transparent animate-[loading-slide_1.5s_ease-in-out_infinite]" />
      {(phase || detail) && (
        <div className="absolute top-2 left-4 text-xs text-text-dim font-mono">
          {phase}{detail ? ` · ${detail}` : ''}
        </div>
      )}
    </div>
  )
}
