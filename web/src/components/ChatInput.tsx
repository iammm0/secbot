import { useEffect, useMemo, useRef, useState } from 'react'
import { Icon } from '@/components/Icon'
import { InputModelPicker } from '@/components/InputModelPicker'
import { SlashMenu } from '@/components/SlashMenu'
import { MESSAGE_PLACEHOLDER } from '@/lib/copy'
import { formatElapsed } from '@/lib/formatElapsed'
import { emitSlash, fetchCommandCatalog, filterSlashCommands, resolveSlash, SLASH_COMMANDS, type SlashCommand } from '@/lib/slashCommands'
import { registerChatQuote, type ChatQuote } from '@/lib/chatQuote'
interface Props {
  onSubmit: (message: string) => void
  onStop?: () => void
  placeholder?: string
  disabled?: boolean
  autoFocus?: boolean
  streaming?: boolean
  paused?: boolean
  elapsedMs?: number
}

type ActionMode = 'send' | 'stop' | 'continue'

export function ChatInput({
  onSubmit,
  onStop,
  placeholder = MESSAGE_PLACEHOLDER,
  disabled = false,
  autoFocus = false,
  streaming = false,
  paused = false,
  elapsedMs = 0,
}: Props) {
  const [value, setValue] = useState('')
  const [quotes, setQuotes] = useState<Array<ChatQuote & { id: string }>>([])
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [catalog, setCatalog] = useState<SlashCommand[]>(SLASH_COMMANDS)
  const [burst, setBurst] = useState(false)
  const ref = useRef<HTMLTextAreaElement>(null)

  const suggestions = useMemo(() => filterSlashCommands(value, catalog), [value, catalog])
  const hasText = value.trim().length > 0 || quotes.length > 0

  const actionMode: ActionMode = streaming ? 'stop' : paused ? 'continue' : 'send'
  const actionEnabled =
    actionMode === 'stop' ||
    (!disabled && (actionMode === 'continue' || (actionMode === 'send' && hasText)))

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
    registerChatQuote((quote) => {
      setQuotes((current) => {
        if (current.some((item) => item.code === quote.code && item.language === quote.language)) return current
        const id = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}`
        return [...current, { ...quote, id }]
      })
      ref.current?.focus()
    })
    return () => registerChatQuote(null)
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
    if (!trimmed && quotes.length === 0 && !paused) return
    const cited = quotes.map((quote) => fenceQuote(quote.language, quote.code)).join('\n\n')
    onSubmit([cited, trimmed].filter(Boolean).join('\n\n') || '继续任务')
    setValue('')
    setQuotes([])
    setBurst(true)
    window.setTimeout(() => setBurst(false), 420)
  }

  const handleAction = () => {
    if (actionMode === 'stop') {
      onStop?.()
      return
    }
    if (!disabled) submit(value)
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
      if (streaming) {
        onStop?.()
        return
      }
      if (!disabled) submit(value)
    }
  }

  const actionLabel =
    actionMode === 'stop' ? '暂停任务' : actionMode === 'continue' ? '继续任务' : '发送'

  return (
    <div className="relative">
      <SlashMenu
        commands={suggestions}
        selectedIndex={Math.min(selectedIndex, Math.max(0, suggestions.length - 1))}
        onSelect={command => runCommand(command)}
      />
      <div
        className={`glass-card overflow-visible p-2.5 transition-all duration-200 focus-within:border-primary/35 focus-within:shadow-[0_0_0_1px_rgba(0,255,136,0.08)] ${
          streaming ? 'border-warning/25' : paused ? 'border-primary/25' : ''
        }`}
      >
        {quotes.length > 0 ? (
          <div className="mb-2 flex flex-wrap gap-1.5 px-1">
            {quotes.map((quote) => (
              <span
                key={quote.id}
                className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-border bg-hover/70 px-2 py-1 font-mono text-[11px] text-text"
              >
                <span className="shrink-0 uppercase tracking-wide text-text-dim">{quote.language || 'code'}</span>
                <span className="min-w-0 truncate">{quote.code.replace(/\s+/g, ' ')}</span>
                <button
                  type="button"
                  aria-label="移除引用"
                  className="shrink-0 text-text-dim hover:text-text"
                  onClick={() => setQuotes((current) => current.filter((item) => item.id !== quote.id))}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        ) : null}
        <textarea
          ref={ref}
          value={value}
          onChange={event => setValue(event.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            streaming
              ? '任务进行中… Enter 可暂停'
              : paused
                ? '补充说明后点继续，或直接回车'
                : placeholder
          }
          disabled={disabled && !streaming}
          rows={1}
          className="w-full resize-none bg-transparent px-1.5 pt-1 font-mono text-sm text-text outline-none placeholder:text-text-dim disabled:opacity-50"
          style={{ minHeight: '1.75rem', maxHeight: '12rem' }}
          onInput={event => {
            const target = event.currentTarget
            target.style.height = 'auto'
            target.style.height = `${Math.min(target.scrollHeight, 192)}px`
          }}
        />

        <div className="mt-2 flex items-center justify-between gap-2 px-0.5">
          <div className="flex min-w-0 items-center gap-2">
            <InputModelPicker disabled={streaming} />
            {streaming ? (
              <span className="hidden items-center gap-1.5 font-mono text-[10px] text-warning sm:inline-flex">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-warning" />
                running
                {elapsedMs > 0 ? (
                  <span className="tabular-nums text-warning/80">{formatElapsed(elapsedMs)}</span>
                ) : null}
              </span>
            ) : paused ? (
              <span className="hidden items-center gap-1.5 font-mono text-[10px] text-primary sm:inline-flex">
                <span className="h-1.5 w-1.5 rounded-full bg-primary" />
                paused
                {elapsedMs > 0 ? (
                  <span className="tabular-nums text-primary/80">{formatElapsed(elapsedMs)}</span>
                ) : null}
              </span>
            ) : null}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <button
            type="button"
            onClick={handleAction}
            disabled={!actionEnabled}
            aria-label={actionLabel}
            title={actionLabel}
            className={`composer-action relative inline-flex h-9 w-9 items-center justify-center rounded-full transition-all duration-200 ${
              actionMode === 'stop'
                ? 'bg-warning/20 text-warning ring-1 ring-warning/40 hover:bg-warning/30'
                : actionMode === 'continue'
                  ? 'bg-primary/20 text-primary ring-1 ring-primary/40 hover:bg-primary/30'
                  : actionEnabled
                    ? 'bg-primary text-bg shadow-[0_0_16px_rgba(0,255,136,0.35)] hover:brightness-110'
                    : 'bg-hover text-text-dim opacity-50'
            } ${burst ? 'composer-action-burst' : ''} ${streaming ? 'composer-action-busy' : ''} disabled:cursor-not-allowed`}
          >
            {actionMode === 'stop' ? (
              <Icon name="pause" type="bold" size={14} className="pointer-events-none" />
            ) : actionMode === 'continue' ? (
              <Icon name="play" type="bold" size={15} className="pointer-events-none" />
            ) : (
              <Icon name="send-2" type="bold" size={15} className="pointer-events-none" />
            )}
          </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function fenceQuote(language: string | undefined, code: string): string {
  const run = code.match(/`+/g)?.reduce((longest, ticks) => Math.max(longest, ticks.length), 0) ?? 0
  const fence = '`'.repeat(Math.max(3, run + 1))
  return `${fence}${language ?? ''}\n${code}\n${fence}`
}
