import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Icon } from '@/components/Icon'
import { addToChat } from '@/lib/chatQuote'
import { useChatEdit, useMessageEditScope } from '@/lib/chatResubmit'

interface Props {
  children: ReactNode
  content: string
  quoteLabel: '用户' | 'Secbot'
  blockId?: string
  align?: 'left' | 'right'
  className?: string
}

function selectedTextWithin(container: HTMLElement | null): string {
  const selection = window.getSelection()
  if (!container || !selection || selection.isCollapsed || !selection.anchorNode || !selection.focusNode) {
    return ''
  }
  if (!container.contains(selection.anchorNode) || !container.contains(selection.focusNode)) return ''
  return selection.toString().trim()
}

async function copyText(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text)
    return
  }
  const textarea = document.createElement('textarea')
  textarea.value = text
  textarea.style.position = 'fixed'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  textarea.select()
  document.execCommand('copy')
  textarea.remove()
}

export function MessageActions({
  children,
  content,
  quoteLabel,
  blockId,
  align = 'left',
  className = '',
}: Props) {
  const contentRef = useRef<HTMLDivElement>(null)
  const draftRef = useRef<HTMLTextAreaElement>(null)
  const editMessage = useChatEdit()
  const editScope = useMessageEditScope()
  const [copied, setCopied] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(content)

  useEffect(() => {
    if (!editing) setDraft(content)
  }, [content, editing])

  useEffect(() => {
    if (!editing || !draftRef.current) return
    const field = draftRef.current
    field.focus()
    field.setSelectionRange(field.value.length, field.value.length)
    field.style.height = 'auto'
    field.style.height = `${Math.min(field.scrollHeight, 240)}px`
  }, [editing])

  const actionableText = () => selectedTextWithin(contentRef.current) || content.trim()

  const handleCopy = async () => {
    const text = actionableText()
    if (!text) return
    try {
      await copyText(text)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopied(false)
    }
  }

  const handleQuote = () => {
    const text = actionableText()
    if (!text) return
    addToChat({ kind: 'message', label: quoteLabel, code: text })
  }

  const startEdit = () => {
    setDraft(content)
    setEditing(true)
  }

  const submitEdit = () => {
    const text = draft.trim()
    if (!text || !editMessage || !editScope) return
    setEditing(false)
    editMessage({
      turnKey: editScope.turnKey,
      role: quoteLabel === '用户' ? 'user' : 'assistant',
      blockId,
      conversationId: editScope.conversationId,
    }, text, content)
  }

  return (
    <div className={`group/message relative ${className}`.trim()}>
      {editing ? (
        <div
          className={`rounded-2xl border border-primary/30 bg-primary/5 p-2 ${
            align === 'right' ? 'rounded-br-sm' : 'rounded-bl-sm'
          }`}
        >
          <textarea
            ref={draftRef}
            value={draft}
            aria-label="重新编辑消息"
            rows={2}
            className="w-full resize-none bg-transparent px-1.5 py-1 font-mono text-sm text-text outline-none"
            style={{ minHeight: '2.5rem', maxHeight: '15rem' }}
            onChange={(event) => {
              setDraft(event.target.value)
              const field = event.currentTarget
              field.style.height = 'auto'
              field.style.height = `${Math.min(field.scrollHeight, 240)}px`
            }}
            onKeyDown={(event) => {
              if (event.nativeEvent.isComposing) return
              if (event.key === 'Escape') {
                event.preventDefault()
                setEditing(false)
                return
              }
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                submitEdit()
              }
            }}
          />
          <div className="mt-1 flex items-center justify-end gap-1.5">
            <button
              type="button"
              className="rounded-md px-2 py-1 font-mono text-[11px] text-text-dim hover:bg-hover hover:text-text"
              onClick={() => setEditing(false)}
            >
              取消
            </button>
            <button
              type="button"
              className="rounded-md bg-primary px-2 py-1 font-mono text-[11px] text-bg disabled:cursor-not-allowed disabled:opacity-40"
              disabled={!draft.trim()}
              onClick={submitEdit}
            >
              提交
            </button>
          </div>
        </div>
      ) : (
      <div ref={contentRef}>{children}</div>
      )}
      {!editing ? (
      <div
        className={`absolute -bottom-3 z-10 flex items-center gap-0.5 rounded-md border border-border bg-popover/95 p-0.5 font-mono text-[10px] text-text-dim opacity-0 shadow-sm backdrop-blur-sm transition-opacity group-hover/message:opacity-100 focus-within:opacity-100 ${
          align === 'right' ? 'right-1' : 'left-1'
        }`}
      >
        <button
          type="button"
          title="复制消息；选中文字后仅复制选中内容"
          aria-label={copied ? '已复制' : '复制消息'}
          className="inline-flex h-6 items-center gap-1 rounded px-1.5 hover:bg-hover hover:text-text"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => void handleCopy()}
        >
          <Icon name="document-text" size={12} />
          {copied ? '已复制' : '复制'}
        </button>
        <button
          type="button"
          title="引用消息；选中文字后仅引用选中内容"
          aria-label="引用消息"
          className="inline-flex h-6 items-center gap-1 rounded px-1.5 hover:bg-hover hover:text-text"
          onMouseDown={(event) => event.preventDefault()}
          onClick={handleQuote}
        >
          <Icon name="message-text" size={12} />
          引用
        </button>
        {editMessage && editScope ? (
          <button
            type="button"
            title="重新编辑这条消息"
            aria-label="重新编辑并提交"
            className="inline-flex h-6 items-center gap-1 rounded px-1.5 hover:bg-hover hover:text-text"
            onMouseDown={(event) => event.preventDefault()}
            onClick={startEdit}
          >
            <Icon name="edit-2" size={12} />
            编辑
          </button>
        ) : null}
      </div>
      ) : null}
    </div>
  )
}
