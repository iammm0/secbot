import { createFileRoute } from '@tanstack/react-router'
import { useRef, useEffect } from 'react'
import { useChat } from '@/hooks/useChat'
import { useSessionStore } from '@/hooks/useSessionStore'
import { ChatInput } from '@/components/ChatInput'
import { StatusBar } from '@/components/StatusBar'
import { LoadingBar } from '@/components/LoadingBar'
import { BlockRouter, ErrorBlock, ReportBlock } from '@/components/blocks/BlockRouter'
import { UserMessageBlock } from '@/components/blocks/UserMessageBlock'

type SessionSearch = { prompt?: string }

export const Route = createFileRoute('/session/$id')({
  validateSearch: (search: Record<string, unknown>): SessionSearch => ({
    prompt: search.prompt as string | undefined,
  }),
  component: SessionView,
})

function SessionView() {
  const { id } = Route.useParams()
  const { prompt } = Route.useSearch()
  const { addSession, updateLabel } = useSessionStore()
  const { streaming, streamState, history, sendMessage } = useChat(id)
  const scrollRef = useRef<HTMLDivElement>(null)
  const sentInitial = useRef(false)

  useEffect(() => {
    addSession(id)
  }, [id, addSession])

  useEffect(() => {
    if (prompt && !sentInitial.current) {
      sentInitial.current = true
      updateLabel(id, prompt)
      sendMessage(prompt)
    }
  }, [prompt, sendMessage, id, updateLabel])

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [streamState?.timeline.length, history.length])

  const handleSubmit = (msg: string) => {
    updateLabel(id, msg)
    sendMessage(msg)
  }

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden pt-12 md:pt-0">
      {streaming && <LoadingBar phase={streamState?.phase} detail={streamState?.detail} />}
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6 space-y-3">
        {history.map((item, i) => (
          <div key={i} className="space-y-3">
            <UserMessageBlock message={item.userMessage} />
            {item.streamState.timeline.map((block) => (
              <BlockRouter key={block.id} item={block} />
            ))}
          </div>
        ))}
        {streamState && (
          <div className="space-y-3">
            {streamState.currentUserMessage && (
              <UserMessageBlock message={streamState.currentUserMessage} />
            )}
            {streamState.timeline.map((block) => (
              <BlockRouter key={block.id} item={block} />
            ))}
            {streamState.report && (
              <ReportBlock item={{ id: 'report', type: 'final', title: 'Report', body: streamState.report }} />
            )}
            {streamState.error && <ErrorBlock message={streamState.error} />}
          </div>
        )}
      </div>
      <div className="px-4 pb-4 pt-2">
        <ChatInput onSubmit={handleSubmit} disabled={streaming} placeholder={streaming ? 'Thinking...' : 'Message SecBot...'} />
      </div>
      <StatusBar contextUsage={streamState?.contextUsage ?? null} phase={streamState?.phase} />
    </div>
  )
}
