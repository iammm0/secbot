import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { nanoid } from 'nanoid'
import { ChatInput } from '@/components/ChatInput'
import { useSessionStore } from '@/hooks/useSessionStore'
import { sessionBelongsToWorkspace, useWorkspaceStore } from '@/hooks/useWorkspaceStore'
import { MESSAGE_PLACEHOLDER, NEW_CHAT, RECENT_CHATS } from '@/lib/copy'

export const Route = createFileRoute('/')({
  component: HomeView,
})

function HomeView() {
  const navigate = useNavigate()
  const { sessions, addSession } = useSessionStore()
  const workspaces = useWorkspaceStore()

  const handleSubmit = (message: string) => {
    const id = nanoid(10)
    addSession(id)
    void workspaces.bindSession(id, workspaces.activeId)
    navigate({ to: '/session/$id', params: { id }, search: { prompt: message } })
  }

  const openSession = (id: string) => {
    navigate({ to: '/session/$id', params: { id } })
  }

  const recent = sessions
    .filter((session) => sessionBelongsToWorkspace(session.id, workspaces.activeId, workspaces.sessionWorkspace))
    .slice(0, 8)

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 pt-12 md:pt-0">
      <p className="mb-6 text-sm text-text-dim">智能安全自动化 · 同一会话里可以连续聊</p>
      <div className="w-full max-w-2xl">
        <ChatInput
          onSubmit={handleSubmit}
          placeholder={MESSAGE_PLACEHOLDER}
          autoFocus
        />
        {recent.length > 0 ? (
          <div className="mt-8">
            <div className="mb-2 font-mono text-xs text-text-dim">{RECENT_CHATS}</div>
            <div className="space-y-1">
              {recent.map((session) => (
                <button
                  key={session.id}
                  type="button"
                  onClick={() => openSession(session.id)}
                  className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left font-mono text-sm text-text-dim transition-colors hover:bg-hover hover:text-text"
                >
                  <span className="truncate">{session.label || NEW_CHAT}</span>
                  <span className="ml-3 shrink-0 text-[10px] text-text-dim">
                    {formatAgo(session.updatedAt ?? session.createdAt)}
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}

function formatAgo(ts: number): string {
  const delta = Date.now() - ts
  if (!Number.isFinite(ts) || delta < 60_000) return '刚刚'
  if (delta < 3_600_000) return `${Math.floor(delta / 60_000)} 分钟前`
  if (delta < 86_400_000) return `${Math.floor(delta / 3_600_000)} 小时前`
  return `${Math.floor(delta / 86_400_000)} 天前`
}
