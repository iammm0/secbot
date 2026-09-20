import { useState, useEffect, useRef, type ReactNode } from 'react'
import { useNavigate, useParams } from '@tanstack/react-router'
import { nanoid } from 'nanoid'
import { Icon } from '@/components/Icon'
import { AddHostDialog } from '@/components/workspace/AddHostDialog'
import { CreateWorkspaceDialog } from '@/components/workspace/CreateWorkspaceDialog'
import { useSessionStore, type SessionEntry } from '@/hooks/useSessionStore'
import { sessionBelongsToWorkspace, useWorkspaceStore } from '@/hooks/useWorkspaceStore'
import { fetchChatSessions } from '@/lib/chatApi'
import { DEFAULT_WORKSPACE_ID, type Workspace, type WorkspaceNode } from '@/lib/workspaceApi'

interface Props {
  onClear?: () => void
}

function collapseIfMobile(setCollapsed: (value: boolean) => void) {
  if (window.matchMedia('(max-width: 767px)').matches) {
    setCollapsed(true)
  }
}

function nodeIcon(kind: WorkspaceNode['kind']): string {
  if (kind === 'local') return 'monitor'
  if (kind === 'ssh') return 'link'
  return 'global'
}

function statusDot(status: WorkspaceNode['status']): string {
  if (status === 'online') return 'bg-primary'
  if (status === 'offline') return 'bg-error'
  return 'bg-text-dim/40'
}

export function Sidebar({ onClear }: Props) {
  const [collapsed, setCollapsed] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 767px)').matches : false,
  )
  const [workspaceOpen, setWorkspaceOpen] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [hostOpen, setHostOpen] = useState(false)
  const navigate = useNavigate()
  const params = useParams({ strict: false }) as { id?: string }
  const { sessions, addSession, removeSession, renameSession, reorderSessions, hydrateFromServer } = useSessionStore()
  const workspaces = useWorkspaceStore()

  useEffect(() => {
    let cancelled = false
    void fetchChatSessions()
      .then((payload) => {
        if (!cancelled) hydrateFromServer(payload.sessions ?? [])
      })
      .catch(() => {
        /* sidebar still works from local cache */
      })
    return () => {
      cancelled = true
    }
  }, [hydrateFromServer])

  const labelReveal = collapsed
    ? 'max-w-0 opacity-0'
    : 'max-w-[10rem] opacity-100 delay-100'
  const labelMotion = `overflow-hidden whitespace-nowrap transition-[max-width,opacity] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] ${labelReveal}`

  const workspaceSessions = sessions.filter((session) =>
    sessionBelongsToWorkspace(session.id, workspaces.activeId, workspaces.sessionWorkspace),
  )
  const currentSession = workspaceSessions.find((session) => session.id === params.id)

  const newChat = async () => {
    const id = nanoid(10)
    addSession(id)
    try {
      await workspaces.bindSession(id, workspaces.activeId)
    } catch {
      /* chat still opens locally */
    }
    navigate({ to: '/session/$id', params: { id } })
    collapseIfMobile(setCollapsed)
    setChatOpen(false)
  }

  const selectSession = (id: string) => {
    navigate({ to: '/session/$id', params: { id } })
    collapseIfMobile(setCollapsed)
    setChatOpen(false)
  }

  const handleRemoveSession = (id: string) => {
    const remaining = workspaceSessions.filter((session) => session.id !== id)
    removeSession(id)
    if (params.id === id) {
      if (remaining[0]) {
        navigate({ to: '/session/$id', params: { id: remaining[0].id } })
      } else {
        navigate({ to: '/' })
      }
    }
  }

  const selectWorkspace = (workspace: Workspace) => {
    workspaces.setActiveId(workspace.id)
    setWorkspaceOpen(false)
    const stillVisible = params.id
      ? sessionBelongsToWorkspace(params.id, workspace.id, workspaces.sessionWorkspace)
      : false
    if (!stillVisible) navigate({ to: '/' })
    collapseIfMobile(setCollapsed)
  }

  return (
    <>
      <button
        onClick={() => setCollapsed(false)}
        className={`fixed top-3 left-3 z-40 rounded border border-border bg-bg/90 p-2 text-text-dim transition-opacity duration-200 hover:text-text md:hidden ${
          collapsed ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        aria-label="打开侧边栏"
      >
        <Icon name="menu" />
      </button>

      <div
        className={`fixed inset-0 z-40 bg-overlay transition-opacity duration-300 md:hidden ${
          collapsed ? 'pointer-events-none opacity-0' : 'opacity-100'
        }`}
        onClick={() => setCollapsed(true)}
      />

      <aside
        className={`fixed z-50 flex h-full flex-col overflow-hidden border-r border-border bg-bg/95 backdrop-blur-sm transition-[width,transform] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] md:relative md:bg-bg/80 md:backdrop-blur-none ${
          collapsed
            ? 'w-64 -translate-x-full md:w-12 md:translate-x-0'
            : 'w-64 translate-x-0'
        }`}
      >
        <div className="flex items-center justify-between border-b border-border px-3 py-3">
          <div className={`flex min-w-0 items-center ${collapsed ? 'justify-center' : 'gap-2'}`}>
            <span className={`text-sm font-bold font-mono text-primary ${labelMotion}`}>
              SECBOT
            </span>
          </div>
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="shrink-0 text-text-dim transition-colors duration-200 hover:text-text"
            aria-label={collapsed ? '展开侧边栏' : '收起侧边栏'}
          >
            <span
              className={`inline-flex transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] ${
                collapsed ? '' : 'rotate-180'
              }`}
            >
              <Icon name="arrow-right-02" />
            </span>
          </button>
        </div>

        <div className={`space-y-1 px-2 pt-2 ${collapsed ? 'px-1' : ''}`}>
          <SwitcherButton
            collapsed={collapsed}
            open={workspaceOpen}
            icon="folder-2"
            label={workspaces.active?.name ?? '本机'}
            ariaLabel="切换工作空间"
            onToggle={() => {
              setChatOpen(false)
              setWorkspaceOpen((value) => !value)
            }}
            onClose={() => setWorkspaceOpen(false)}
          >
            {workspaces.workspaces.map((workspace) => (
              <MenuItem
                key={workspace.id}
                active={workspace.id === workspaces.activeId}
                onClick={() => selectWorkspace(workspace)}
              >
                <Icon name="folder-2" size={14} />
                <span className="min-w-0 flex-1 truncate">{workspace.name}</span>
                {workspace.id === DEFAULT_WORKSPACE_ID ? (
                  <span className="text-[10px] text-text-dim">默认</span>
                ) : null}
              </MenuItem>
            ))}
            <div className="my-1 border-t border-border" />
            <MenuItem onClick={() => { setWorkspaceOpen(false); setCreateOpen(true) }}>
              <Icon name="add" size={14} />
              新建工作空间
            </MenuItem>
            <MenuItem onClick={() => { setWorkspaceOpen(false); setHostOpen(true) }}>
              <Icon name="monitor" size={14} />
              添加主机节点
            </MenuItem>
            {workspaces.active && workspaces.active.id !== DEFAULT_WORKSPACE_ID ? (
              <MenuItem
                danger
                onClick={() => {
                  setWorkspaceOpen(false)
                  void workspaces.remove(workspaces.activeId)
                }}
              >
                <Icon name="close-circle" size={14} />
                删除当前工作空间
              </MenuItem>
            ) : null}
          </SwitcherButton>

          <SwitcherButton
            collapsed={collapsed}
            open={chatOpen}
            icon="message-text"
            label={currentSession?.label ?? '选择对话'}
            ariaLabel="切换对话"
            onToggle={() => {
              setWorkspaceOpen(false)
              setChatOpen((value) => !value)
            }}
            onClose={() => setChatOpen(false)}
          >
            <MenuItem onClick={() => void newChat()}>
              <Icon name="add" size={14} />
              新对话
            </MenuItem>
            {workspaceSessions.length > 0 ? <div className="my-1 border-t border-border" /> : null}
            {workspaceSessions.map((session) => (
              <MenuItem
                key={session.id}
                active={session.id === params.id}
                onClick={() => selectSession(session.id)}
              >
                <span className="min-w-0 flex-1 truncate">{session.label}</span>
              </MenuItem>
            ))}
          </SwitcherButton>
        </div>

        <button
          onClick={() => void newChat()}
          className="mx-2 mt-2 flex items-center justify-center gap-1 truncate rounded border border-primary/30 px-2 py-1.5 font-mono text-xs text-primary transition-colors duration-200 hover:bg-primary/10"
        >
          <Icon name="add" className="shrink-0" />
          <span className={labelMotion}>新对话</span>
        </button>

        <div className="mt-2 flex-1 space-y-0.5 overflow-y-auto overflow-x-hidden px-1">
          {workspaceSessions.map((s) => (
            <SessionRow
              key={s.id}
              session={s}
              active={s.id === params.id}
              collapsed={collapsed}
              labelMotion={labelMotion}
              onSelect={selectSession}
              onRename={renameSession}
              onRemove={handleRemoveSession}
              onReorder={reorderSessions}
            />
          ))}

          {!collapsed && (workspaces.active?.nodes.length ?? 0) > 0 ? (
            <div className="mt-3 space-y-1 px-1 pb-2">
              <div className="px-1 font-mono text-[10px] uppercase tracking-wider text-text-dim">主机节点</div>
              {workspaces.active?.nodes.map((node) => {
                const selected = workspaces.activeNodeId === node.id
                return (
                  <button
                    key={node.id}
                    type="button"
                    className={`flex w-full items-center gap-2 rounded px-2 py-1 text-left text-[11px] transition-colors ${
                      selected ? 'bg-primary/15 text-primary' : 'text-text-dim hover:bg-hover hover:text-text'
                    }`}
                    title={
                      node.kind === 'ssh'
                        ? '远程命令执行（仅 execute_command 走 SSH）'
                        : node.error || node.address
                    }
                    onClick={() => {
                      workspaces.setActiveNodeId(node.id)
                      if (params.id) void workspaces.bindSession(params.id, workspaces.activeId, node.id)
                    }}
                  >
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${statusDot(node.status)}`} />
                    <Icon name={nodeIcon(node.kind)} size={12} />
                    <span className="min-w-0 flex-1 truncate">{node.name}</span>
                    {node.kind === 'ssh' ? (
                      <span className="shrink-0 text-[9px] text-text-dim">远程命令</span>
                    ) : null}
                    {node.kind === 'secbot' ? (
                      <span className="shrink-0 text-[9px] text-text-dim">Secbot</span>
                    ) : null}
                    {node.kind !== 'local' ? (
                      <span
                        role="button"
                        className="hover:text-text"
                        onClick={(event) => {
                          event.stopPropagation()
                          void workspaces.connectNode(workspaces.activeId, node.id)
                        }}
                        aria-label={`重新连接 ${node.name}`}
                      >
                        <Icon name="link" size={12} />
                      </span>
                    ) : null}
                  </button>
                )
              })}
            </div>
          ) : null}
        </div>

        <div className="flex h-10 shrink-0 items-center border-t border-border px-2">
          <button
            onClick={() => {
              void navigate({ to: '/settings' })
              collapseIfMobile(setCollapsed)
            }}
            className="flex h-8 w-full items-center gap-2 rounded px-2 text-xs text-text-dim transition-colors duration-200 hover:bg-hover hover:text-text"
            title="设置"
          >
            <Icon name="setting-2" className="shrink-0" />
            <span className={labelMotion}>设置</span>
          </button>
          {onClear && (
            <button
              onClick={onClear}
              className={`ml-1 shrink-0 rounded px-2 py-1 text-xs text-text-dim transition-[colors,opacity] duration-200 hover:bg-hover hover:text-text ${
                collapsed ? 'pointer-events-none w-0 overflow-hidden p-0 opacity-0' : 'opacity-100'
              }`}
            >
              清空
            </button>
          )}
        </div>
      </aside>

      {createOpen ? (
        <CreateWorkspaceDialog
          onClose={() => setCreateOpen(false)}
          onCreate={(name) => workspaces.create(name).then(() => undefined)}
        />
      ) : null}
      {hostOpen ? (
        <AddHostDialog
          onClose={() => setHostOpen(false)}
          onSubmit={(body) => workspaces.addNode(workspaces.activeId, body).then(() => undefined)}
        />
      ) : null}
    </>
  )
}

function SwitcherButton({
  collapsed,
  open,
  icon,
  label,
  ariaLabel,
  onToggle,
  onClose,
  children,
}: {
  collapsed: boolean
  open: boolean
  icon: string
  label: string
  ariaLabel: string
  onToggle: () => void
  onClose: () => void
  children: ReactNode
}) {
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointer = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) onClose()
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [open, onClose])

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={onToggle}
        aria-label={ariaLabel}
        aria-expanded={open}
        className={`flex w-full items-center rounded px-2 py-1.5 text-xs text-text-dim transition-colors hover:bg-hover hover:text-text ${
          collapsed ? 'justify-center' : 'gap-2'
        }`}
      >
        <Icon name={icon} size={14} className="shrink-0" />
        {!collapsed ? (
          <>
            <span className="min-w-0 flex-1 truncate text-left font-mono">{label}</span>
            <Icon
              name="arrow-down-01"
              size={12}
              className={`shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
            />
          </>
        ) : null}
      </button>
      {!collapsed && open ? (
        <div className="absolute left-0 right-0 z-40 mt-1 max-h-72 overflow-y-auto rounded-lg border border-border bg-popover py-1 shadow-xl">
          {children}
        </div>
      ) : null}
    </div>
  )
}

function MenuItem({
  children,
  onClick,
  active = false,
  danger = false,
}: {
  children: ReactNode
  onClick: () => void
  active?: boolean
  danger?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs ${
        danger
          ? 'text-error hover:bg-error/10'
          : active
            ? 'bg-primary/10 text-primary'
            : 'text-text-dim hover:bg-hover hover:text-text'
      }`}
    >
      {children}
    </button>
  )
}

function SessionRow({
  session,
  active,
  collapsed,
  labelMotion,
  onSelect,
  onRename,
  onRemove,
  onReorder,
}: {
  session: SessionEntry
  active: boolean
  collapsed: boolean
  labelMotion: string
  onSelect: (id: string) => void
  onRename: (id: string, label: string) => void
  onRemove: (id: string) => void
  onReorder: (draggedId: string, targetId: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(session.label)
  const [dragging, setDragging] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!editing) setDraft(session.label)
  }, [session.label, editing])

  useEffect(() => {
    if (editing) inputRef.current?.focus()
  }, [editing])

  const commitRename = () => {
    const next = draft.trim()
    setEditing(false)
    if (!next || next === session.label) {
      setDraft(session.label)
      return
    }
    onRename(session.id, next)
  }

  return (
    <div
      draggable={!collapsed && !editing}
      onDragStart={(event) => {
        if (collapsed || editing) {
          event.preventDefault()
          return
        }
        setDragging(true)
        event.dataTransfer.effectAllowed = 'move'
        event.dataTransfer.setData('text/plain', session.id)
      }}
      onDragEnd={() => {
        setDragging(false)
        setDragOver(false)
      }}
      onDragOver={(event) => {
        if (collapsed || editing) return
        event.preventDefault()
        event.dataTransfer.dropEffect = 'move'
        setDragOver(true)
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(event) => {
        event.preventDefault()
        setDragOver(false)
        const draggedId = event.dataTransfer.getData('text/plain')
        if (draggedId) onReorder(draggedId, session.id)
      }}
      className={`group flex cursor-pointer items-center rounded px-2 py-1.5 font-mono text-xs transition-colors duration-200 ${
        collapsed ? 'justify-center' : 'gap-1'
      } ${
        active
          ? 'bg-primary/10 text-primary'
          : 'text-text-dim hover:bg-hover hover:text-text'
      } ${dragging ? 'opacity-40' : ''} ${dragOver ? 'ring-1 ring-primary/40' : ''}`}
      onClick={() => {
        if (!editing) onSelect(session.id)
      }}
      onDoubleClick={(event) => {
        if (collapsed) return
        event.stopPropagation()
        setDraft(session.label)
        setEditing(true)
      }}
    >
      {!collapsed ? (
        <span
          className="shrink-0 cursor-grab text-text-dim opacity-0 transition-opacity group-hover:opacity-70 active:cursor-grabbing"
          title="拖动排序"
          onMouseDown={(event) => event.stopPropagation()}
        >
          <Icon name="row-vertical" size={12} />
        </span>
      ) : null}
      <span
        className={`shrink-0 text-center transition-opacity duration-200 ${
          collapsed ? 'opacity-100' : 'w-0 overflow-hidden opacity-0'
        }`}
      >
        <Icon name="message-text" size={14} />
      </span>
      {editing && !collapsed ? (
        <input
          ref={inputRef}
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commitRename}
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              commitRename()
            } else if (event.key === 'Escape') {
              event.preventDefault()
              setDraft(session.label)
              setEditing(false)
            }
          }}
          className="min-w-0 flex-1 rounded border border-primary/40 bg-bg px-1.5 py-0.5 text-xs text-text outline-none"
        />
      ) : (
        <span className={`flex-1 truncate ${labelMotion}`} title="双击重命名">
          {session.label}
        </span>
      )}
      {!collapsed && !editing ? (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            setDraft(session.label)
            setEditing(true)
          }}
          className="text-text-dim opacity-0 transition-opacity duration-200 hover:text-text group-hover:opacity-100"
          aria-label="重命名会话"
          title="重命名"
        >
          <Icon name="edit-2" size={12} />
        </button>
      ) : null}
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation()
          onRemove(session.id)
        }}
        className={`text-error transition-opacity duration-200 hover:text-error/80 ${
          collapsed
            ? 'pointer-events-none w-0 overflow-hidden opacity-0'
            : 'opacity-0 group-hover:opacity-100'
        }`}
        aria-label="删除会话"
        title="删除"
      >
        <Icon name="close-circle" size={14} />
      </button>
    </div>
  )
}

