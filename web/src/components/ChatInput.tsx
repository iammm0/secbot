import { useEffect, useMemo, useRef, useState } from 'react'
import { CONTINUE_BUTTON, MESSAGE_PLACEHOLDER, PAUSE_BUTTON } from '@/lib/copy'
import { SlashMenu } from '@/components/SlashMenu'
import { emitSlash, fetchCommandCatalog, filterSlashCommands, resolveSlash, SLASH_COMMANDS, type SlashCommand } from '@/lib/slashCommands'

interface Props {
  onSubmit: (message: string) => void
  onStop?: () => void
  placeholder?: string
  disabled?: boolean
  autoFocus?: boolean
  streaming?: boolean
  paused?: boolean
}

export function ChatInput({
  onSubmit,
  onStop,
  placeholder = MESSAGE_PLACEHOLDER,
  disabled = false,
  autoFocus = false,
  streaming = false,
  paused = false,
}: Props) {
  const [value, setValue] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [catalog, setCatalog] = useState<SlashCommand[]>(SLASH_COMMANDS)
  const ref = useRef<HTMLTextAreaElement>(null)

  const suggestions = useMemo(() => filterSlashCommands(value, catalog), [value, catalog])

  useEffect(() => {
    let cancelled = false
    void fetchCommandCatalog('web')
      .then((payload) => {
        if (!cancelled) setCatalog(payload.commands)
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (autoFocus && ref.current) ref.current.focus()
  }, [autoFocus])

  useEffect(() => {
    setSelectedIndex(0)
  }, [value])

  const runCommand = (command: SlashCommand | string) => {
    const input = typeof command === 'string' ? command : command.slash
    const resolved = resolveSlash(input)
    if (!resolved) return false
    emitSlash(resolved)
    setValue('')
    return true
  }

  const submit = (raw: string) => {
    const trimmed = raw.trim()
    if (streaming) return
    if (suggestions.length > 0) {
      const selected = suggestions[Math.min(selectedIndex, suggestions.length - 1)]
      if (selected && runCommand(selected)) return
    }
    if (trimmed.startsWith('/') && runCommand(trimmed)) return
    if (!trimmed && !paused) return
    onSubmit(trimmed || '继续任务')
    setValue('')
  }

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.nativeEvent.isComposing) return
    if (suggestions.length > 0) {
      if (event.key === 'ArrowDown') {
        event.preventDefault()
        setSelectedIndex(index => Math.min(suggestions.length - 1, index + 1))
        return
      }
      if (event.key === 'ArrowUp') {
        event.preventDefault()
        setSelectedIndex(index => Math.max(0, index - 1))
        return
      }
      if (event.key === 'Tab') {
        event.preventDefault()
        const selected = suggestions[Math.min(selectedIndex, suggestions.length - 1)]
        if (selected) setValue(`${selected.slash} `)
        return
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        setValue('')
        return
      }
    }
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      if (!disabled) submit(value)
    }
  }

  return (
    <div className="relative">
      <SlashMenu
        commands={suggestions}
        selectedIndex={Math.min(selectedIndex, Math.max(0, suggestions.length - 1))}
        onSelect={command => runCommand(command)}
      />
      <div className="glass-card p-3 transition-colors focus-within:border-primary/30">
        <textarea
          ref={ref}
          value={value}
          onChange={event => setValue(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          rows={1}
          className="w-full resize-none bg-transparent font-mono text-sm text-text outline-none placeholder:text-text-dim disabled:opacity-50"
          style={{ minHeight: '1.5rem', maxHeight: '12rem' }}
          onInput={event => {
            const target = event.currentTarget
            target.style.height = 'auto'
            target.style.height = `${Math.min(target.scrollHeight, 192)}px`
          }}
        />
        {(streaming || paused) && (
          <div className="mt-2 flex justify-end">
            {streaming ? (
              <button
                type="button"
                onClick={onStop}
                className="rounded border border-warning/40 px-3 py-1 font-mono text-xs text-warning transition-colors hover:bg-warning/10"
              >
                {PAUSE_BUTTON}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => submit(value)}
                className="rounded border border-primary/40 px-3 py-1 font-mono text-xs text-primary transition-colors hover:bg-primary/10"
              >
                {CONTINUE_BUTTON}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
