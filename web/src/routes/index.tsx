import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { nanoid } from 'nanoid'
import { ChatInput } from '@/components/ChatInput'
import { useSessionStore } from '@/hooks/useSessionStore'

export const Route = createFileRoute('/')({
  component: HomeView,
})

function HomeView() {
  const navigate = useNavigate()
  const { addSession } = useSessionStore()

  const handleSubmit = (message: string) => {
    const id = nanoid(10)
    addSession(id)
    navigate({ to: '/session/$id', params: { id }, search: { prompt: message } })
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-4 pt-12 md:pt-0">
      <h1
        className="mb-7 select-none whitespace-nowrap font-mono font-black uppercase tracking-[0.08em] text-primary leading-none"
        style={{
          fontSize: 'clamp(3rem, 10vw, 8rem)',
          textShadow: '0 0 12px rgba(0,255,136,0.55), 0 0 36px rgba(0,255,136,0.18)',
        }}
      >
        SecBot
      </h1>
      <p className="text-text-dim text-sm mb-6">AI-powered security automation</p>
      <div className="w-full max-w-2xl">
        <ChatInput
          onSubmit={handleSubmit}
          placeholder="Message SecBot..."
          autoFocus
        />
      </div>
    </div>
  )
}
