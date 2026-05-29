import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { nanoid } from 'nanoid'
import { ChatInput } from '@/components/ChatInput'
import { useSessionStore } from '@/hooks/useSessionStore'

export const Route = createFileRoute('/')({
  component: HomeView,
})

const LOGO = `
 ███████╗███████╗ ██████╗██████╗  ██████╗ ████████╗
 ██╔════╝██╔════╝██╔════╝██╔══██╗██╔═══██╗╚══██╔══╝
 ███████╗█████╗  ██║     ██████╔╝██║   ██║   ██║
 ╚════██║██╔══╝  ██║     ██╔══██╗██║   ██║   ██║
 ███████║███████╗╚██████╗██████╔╝╚██████╔╝   ██║
 ╚══════╝╚══════╝ ╚═════╝╚═════╝  ╚═════╝    ╚═╝`

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
      <pre className="hidden sm:block text-primary font-mono text-xs sm:text-sm leading-tight mb-8 select-none drop-shadow-[0_0_12px_rgba(0,255,136,0.4)]">
        {LOGO}
      </pre>
      <h1 className="sm:hidden text-primary font-mono text-2xl font-bold mb-8 drop-shadow-[0_0_12px_rgba(0,255,136,0.4)]">SecBot</h1>
      <p className="text-text-dim text-sm mb-6">AI-powered security automation</p>
      <div className="w-full max-w-2xl">
        <ChatInput onSubmit={handleSubmit} placeholder="Message SecBot..." autoFocus />
      </div>
    </div>
  )
}
