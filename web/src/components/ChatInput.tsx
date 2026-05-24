import { useState, useRef, useEffect } from 'react'

interface Props {
  onSubmit: (message: string) => void
  placeholder?: string
  disabled?: boolean
  autoFocus?: boolean
}

export function ChatInput({ onSubmit, placeholder = 'Ask anything...', disabled = false, autoFocus = false }: Props) {
  const [value, setValue] = useState('')
  const ref = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (autoFocus && ref.current) ref.current.focus()
  }, [autoFocus])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (value.trim() && !disabled) {
        onSubmit(value.trim())
        setValue('')
      }
    }
  }

  return (
    <div className="glass-card p-3 focus-within:border-primary/30 transition-colors">
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        rows={1}
        className="w-full bg-transparent text-text font-mono text-sm resize-none outline-none placeholder:text-text-dim disabled:opacity-50"
        style={{ minHeight: '1.5rem', maxHeight: '12rem' }}
        onInput={(e) => {
          const t = e.currentTarget
          t.style.height = 'auto'
          t.style.height = `${Math.min(t.scrollHeight, 192)}px`
        }}
      />
    </div>
  )
}
