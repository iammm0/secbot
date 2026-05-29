import { useState } from 'react'
import { useNavigate, useParams } from '@tanstack/react-router'
import { nanoid } from 'nanoid'
import { useSessionStore } from '@/hooks/useSessionStore'

interface Props {
  onClear?: () => void
  onOpenSettings?: () => void
}

export function Sidebar({ onClear, onOpenSettings }: Props) {
  const [collapsed, setCollapsed] = useState(true)
  const navigate = useNavigate()
  const params = useParams({ strict: false }) as { id?: string }
  const { sessions, addSession, removeSession } = useSessionStore()

  const newChat = () => {
    const id = nanoid(10)
    addSession(id)
    navigate({ to: '/session/$id', params: { id } })
    setCollapsed(true)
  }

  const selectSession = (id: string) => {
    navigate({ to: '/session/$id', params: { id } })
    setCollapsed(true)
  }

  return (
    <>
      {/* Mobile hamburger button */}
      <button
        onClick={() => setCollapsed(false)}
        className={`fixed top-3 left-3 z-40 md:hidden p-2 rounded bg-bg/90 border border-white/10 text-text-dim hover:text-text ${collapsed ? '' : 'hidden'}`}
      >
        ☰
      </button>

      {/* Overlay for mobile */}
      {!collapsed && (
        <div className="fixed inset-0 z-40 bg-black/50 md:hidden" onClick={() => setCollapsed(true)} />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed md:relative z-50 h-full flex flex-col border-r border-white/10 bg-bg/95 md:bg-bg/80 backdrop-blur-sm md:backdrop-blur-none transition-all
        ${collapsed ? '-translate-x-full md:translate-x-0 md:w-12' : 'translate-x-0 w-64'}
      `}>
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-3 border-b border-white/5">
          {!collapsed && <span className="text-primary font-mono text-sm font-bold">SecBot</span>}
          <button onClick={() => setCollapsed(!collapsed)} className="text-text-dim hover:text-text text-sm">
            {collapsed ? '▶' : '◀'}
          </button>
        </div>

        {/* New Chat */}
        <button onClick={newChat} className="mx-2 mt-2 px-2 py-1.5 rounded text-xs font-mono text-primary border border-primary/30 hover:bg-primary/10 transition-colors truncate">
          {collapsed ? '+' : '+ New Chat'}
        </button>

        {/* Session List */}
        <div className="flex-1 overflow-y-auto mt-2 space-y-0.5 px-1">
          {sessions.map((s) => (
            <div
              key={s.id}
              className={`group flex items-center gap-1 px-2 py-1.5 rounded text-xs font-mono cursor-pointer transition-colors ${
                s.id === params.id ? 'bg-primary/10 text-primary' : 'text-text-dim hover:text-text hover:bg-white/5'
              }`}
              onClick={() => selectSession(s.id)}
            >
              {!collapsed && (
                <>
                  <span className="flex-1 truncate">{s.label}</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); removeSession(s.id) }}
                    className="opacity-0 group-hover:opacity-100 text-error hover:text-error/80 text-[10px]"
                  >✕</button>
                </>
              )}
              {collapsed && <span className="w-full text-center">●</span>}
            </div>
          ))}
        </div>

        {/* Settings */}
        <div className="border-t border-white/5 p-2 space-y-2">
          {!collapsed && (
            <>
              <button onClick={onOpenSettings} className="w-full px-2 py-1 rounded text-xs text-text-dim hover:text-text hover:bg-white/5 transition-colors flex items-center gap-2">
                <span>⚙</span><span>Settings</span>
              </button>
              {onClear && (
                <button onClick={onClear} className="w-full px-2 py-1 rounded text-xs text-text-dim hover:text-text hover:bg-white/5 transition-colors">
                  Clear History
                </button>
              )}
            </>
          )}
          {collapsed && (
            <div className="flex flex-col items-center gap-1">
              <button onClick={onOpenSettings} className="text-[10px] text-text-dim hover:text-primary" title="Settings">⚙</button>
            </div>
          )}
        </div>
      </aside>
    </>
  )
}
