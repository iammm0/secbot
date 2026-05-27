import type { ChatMode } from '@/lib/types'

interface Props {
  mode: ChatMode
  onChange: (mode: ChatMode) => void
}

export function ModeToggle({ mode, onChange }: Props) {
  return (
    <div className="flex gap-2 justify-center">
      {(['ask', 'agent'] as const).map((m) => (
        <button
          key={m}
          onClick={() => onChange(m)}
          className={`px-4 py-1.5 rounded-full text-xs font-medium uppercase tracking-wider transition-all ${
            mode === m
              ? 'bg-primary/20 text-primary border border-primary/40 shadow-[0_0_12px_rgba(0,255,136,0.2)]'
              : 'bg-white/5 text-text-dim border border-white/10 hover:border-white/20'
          }`}
        >
          {m}
        </button>
      ))}
    </div>
  )
}
