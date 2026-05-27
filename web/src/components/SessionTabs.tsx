import { useNavigate, useParams } from '@tanstack/react-router'
import { nanoid } from 'nanoid'

interface Session {
  id: string
  label: string
}

interface Props {
  sessions: Session[]
  onNewSession: () => void
}

export function SessionTabs({ sessions, onNewSession }: Props) {
  const navigate = useNavigate()
  const params = useParams({ strict: false }) as { id?: string }
  const activeId = params.id

  return (
    <div className="flex items-center gap-1 px-4 py-2 border-b border-white/5 overflow-x-auto">
      {sessions.map((s) => (
        <button
          key={s.id}
          onClick={() => navigate({ to: '/session/$id', params: { id: s.id } })}
          className={`px-3 py-1 rounded text-xs font-mono whitespace-nowrap transition-colors ${
            s.id === activeId
              ? 'bg-primary/10 text-primary border border-primary/30'
              : 'text-text-dim hover:text-text hover:bg-white/5'
          }`}
        >
          {s.label}
        </button>
      ))}
      <button
        onClick={onNewSession}
        className="px-2 py-1 rounded text-xs text-text-dim hover:text-primary hover:bg-white/5 transition-colors"
      >
        +
      </button>
    </div>
  )
}

export function useSessionManager() {
  const navigate = useNavigate()
  const params = useParams({ strict: false }) as { id?: string }

  const createSession = () => {
    const id = nanoid(10)
    navigate({ to: '/session/$id', params: { id } })
  }

  return { currentId: params.id, createSession }
}
