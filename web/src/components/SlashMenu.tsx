import type { SlashCommand } from '@/lib/slashCommands'

interface Props {
  commands: SlashCommand[]
  selectedIndex: number
  onSelect: (command: SlashCommand) => void
}

export function SlashMenu({ commands, selectedIndex, onSelect }: Props) {
  if (commands.length === 0) return null

  return (
    <div className="absolute bottom-full left-0 right-0 z-20 mb-2 overflow-hidden rounded-xl border border-border bg-popover shadow-xl">
      {commands.map((command, index) => {
        const selected = index === selectedIndex
        return (
          <button
            key={command.slash}
            type="button"
            onMouseDown={event => {
              event.preventDefault()
              onSelect(command)
            }}
            className={`flex w-full items-center gap-3 px-3 py-2 text-left font-mono text-xs ${
              selected ? 'bg-primary/15 text-primary' : 'text-text hover:bg-hover'
            }`}
          >
            <span className="w-32 shrink-0">{command.slash}</span>
            <span className={selected ? 'text-primary' : 'text-text-dim'}>{command.title}</span>
          </button>
        )
      })}
    </div>
  )
}
