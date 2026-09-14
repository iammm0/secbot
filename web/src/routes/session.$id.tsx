import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useRef, useEffect } from 'react'
import { useChat } from '@/hooks/useChat'
import { useSessionStore } from '@/hooks/useSessionStore'
import { ChatInput } from '@/components/ChatInput'
import { StatusBar } from '@/components/StatusBar'
import { LoadingBar } from '@/components/LoadingBar'
import { BlockRouter, ErrorBlock, ReportBlock } from '@/components/blocks/BlockRouter'
import { UserMessageBlock } from '@/components/blocks/UserMessageBlock'
import { CONTINUE_BUTTON, MESSAGE_PLACEHOLDER, PAUSED_BANNER, PAUSED_PLACEHOLDER, THINKING_PLACEHOLDER } from '@/lib/copy'
import type { HistoryItem, StreamState } from '@/lib/types'

type SessionSearch = { prompt?: string }

export const Route = createFileRoute('/session/$id')({
  validateSearch: (search: Record<string, unknown>): SessionSearch => ({
    prompt: typeof search.prompt === 'string' ? search.prompt : undefined,
  }),
  component: SessionRoute,
})

function SessionRoute() {
  const { id } = Route.useParams()
  return <SessionView key={id} />
}

function TurnThread({ item }: { item: HistoryItem }) {
  return (
    <section className="space-y-3 border-b border-border pb-6 last:border-b-0">
      <UserMessageBlock message={item.userMessage} />
      {item.streamState.timeline.map((block) => (
        <BlockRouter key={block.id} item={block} />
      ))}
      {item.streamState.error ? <ErrorBlock message={item.streamState.error} /> : null}
    </section>
  )
}

function LiveTurn({ state }: { state: StreamState }) {
  const hasLive =
    Boolean(state.currentUserMessage) ||
    state.timeline.length > 0 ||
    Boolean(state.report) ||
    Boolean(state.error)
  if (!hasLive) return null
  return (
    <section className="space-y-3">
      {state.currentUserMessage ? <UserMessageBlock message={state.currentUserMessage} /> : null}
      {state.timeline.map((block) => (
        <BlockRouter key={block.id} item={block} />
      ))}
      {state.report ? (
        <ReportBlock item={{ id: 'report', type: 'final', title: '报告', body: state.report }} />
      ) : null}
      {state.error ? <ErrorBlock message={state.error} /> : null}
    </section>
  )
}

function SessionView() {
  const { id } = Route.useParams()
  const { prompt } = Route.useSearch()
  const navigate = useNavigate()
  const { addSession, updateLabel, touchSession } = useSessionStore()
  const { streaming, paused, streamState, history, sendMessage, stopStream } = useChat(id)
  const scrollRef = useRef<HTMLDivElement>(null)
  const stickToBottom = useRef(true)
  const sentInitial = useRef(false)

  useEffect(() => {
    addSession(id)
  }, [id, addSession])

  useEffect(() => {
    if (!prompt || sentInitial.current) return
    sentInitial.current = true
    const msg = prompt
    void navigate({ to: '/session/$id', params: { id }, search: {}, replace: true })
    updateLabel(id, msg)
    sendMessage(msg)
  }, [prompt, sendMessage, id, updateLabel, navigate])

  useEffect(() => {
    const el = scrollRef.current
    if (!el || !stickToBottom.current) return
    el.scrollTop = el.scrollHeight
  }, [streamState?.timeline.length, streamState?.response, history.length])

  const handleScroll = () => {
    const el = scrollRef.current
    if (!el) return
    stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 96
  }

  const handleSubmit = (msg: string) => {
    stickToBottom.current = true
    updateLabel(id, msg)
    touchSession(id)
    sendMessage(msg)
  }

  const placeholder = streaming
    ? THINKING_PLACEHOLDER
    : paused
      ? PAUSED_PLACEHOLDER
      : MESSAGE_PLACEHOLDER

  const empty = history.length === 0 && !streamState?.currentUserMessage && !streamState?.timeline.length

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden pt-12 md:pt-0">
      {streaming && <LoadingBar phase={streamState?.phase} detail={streamState?.detail} />}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 space-y-6 overflow-y-auto px-4 py-6"
      >
        {history.map((item, i) => (
          <TurnThread key={item.id ?? `${item.sentAt}-${i}`} item={item} />
        ))}
        {streamState ? <LiveTurn state={streamState} /> : null}
        {empty ? (
          <p className="pt-12 text-center font-mono text-sm text-text-dim">
            这是一段连续对话。发送消息后，往上滑可以回顾之前的轮次。
          </p>
        ) : null}
      </div>
      {paused && !streaming && (
        <div className="px-4 pb-1">
          <div className="rounded-lg border border-warning/30 bg-warning/5 px-3 py-2 font-mono text-xs text-warning">
            {PAUSED_BANNER}
            <span className="ml-2 text-text-dim">点「{CONTINUE_BUTTON}」或回车继续。</span>
          </div>
        </div>
      )}
      <div className="px-4 pb-4 pt-2">
        <ChatInput
          onSubmit={handleSubmit}
          onStop={stopStream}
          disabled={streaming}
          streaming={streaming}
          paused={paused}
          placeholder={placeholder}
        />
      </div>
      <StatusBar contextUsage={streamState?.contextUsage ?? null} phase={paused ? 'paused' : streamState?.phase} />
    </div>
  )
}
