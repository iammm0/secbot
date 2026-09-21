import { useEffect, useState } from 'react'
import { useParams } from '@tanstack/react-router'
import { Icon } from '@/components/Icon'
import { AddHostDialog } from '@/components/workspace/AddHostDialog'
import { NodeSurfacePanel } from '@/components/workspace/NodeSurfacePanel'
import { useWorkspaceStore } from '@/hooks/useWorkspaceStore'
import { closeTerminal, fetchTerminals, type TerminalSnapshot } from '@/lib/terminalApi'
import { registerAddHostOpener } from '@/lib/rightRail'
import type { WorkspaceNode } from '@/lib/workspaceApi'

const OPEN_KEY = 'secbot-right-rail-open'
type RailTab = 'nodes' | 'topology' | 'terminals'

function readOpen(): boolean {
  try {
    return localStorage.getItem(OPEN_KEY) !== '0'
  } catch {
    return true
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

export function RightRail() {
  const [open, setOpen] = useState(readOpen)
  const [tab, setTab] = useState<RailTab>('nodes')
  const [hostOpen, setHostOpen] = useState(false)
  const [terminals, setTerminals] = useState<TerminalSnapshot[]>([])
  const [terminalError, setTerminalError] = useState('')
  const [selectedTerminal, setSelectedTerminal] = useState<string | null>(null)
  const workspaces = useWorkspaceStore()
  const params = useParams({ strict: false }) as { id?: string }
  const nodes = workspaces.active?.nodes ?? []
  const selectedNode =
    nodes.find((node) => node.id === workspaces.activeNodeId) ?? nodes[0] ?? null

  useEffect(() => {
    registerAddHostOpener(() => {
      setOpen(true)
      setTab('nodes')
      setHostOpen(true)
    })
    return () => registerAddHostOpener(null)
  }, [])

  useEffect(() => {
    try {
      localStorage.setItem(OPEN_KEY, open ? '1' : '0')
    } catch {
      /* ignore */
    }
  }, [open])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    const load = async () => {
      try {
        const list = await fetchTerminals()
        if (cancelled) return
        setTerminals(list)
        setTerminalError('')
        setSelectedTerminal((current) => {
          if (current && list.some((item) => item.session_id === current)) return current
          return list[0]?.session_id ?? null
        })
      } catch (err) {
        if (!cancelled) setTerminalError(err instanceof Error ? err.message : '加载终端失败')
      }
    }
    void load()
    const timer = setInterval(() => void load(), 2000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [open])

  const selectNode = (node: WorkspaceNode) => {
    workspaces.setActiveNodeId(node.id)
    if (params.id) void workspaces.bindSession(params.id, workspaces.activeId, node.id)
  }

  const activeTerminal = terminals.find((item) => item.session_id === selectedTerminal) ?? null

  return (
    <div className="flex h-full shrink-0">
      <aside
        className={`flex h-full shrink-0 flex-col overflow-hidden border-l border-border bg-bg transition-[width] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] ${
          open ? 'w-[22rem]' : 'w-10'
        }`}
      >
        <div className={`flex h-10 shrink-0 items-center border-b border-border ${open ? 'gap-1 px-1.5' : 'justify-center'}`}>
          {open ? (
            <>
              <RailTabButton active={tab === 'nodes'} onClick={() => setTab('nodes')}>
                节点
              </RailTabButton>
              <RailTabButton active={tab === 'topology'} onClick={() => setTab('topology')}>
                拓扑
              </RailTabButton>
              <RailTabButton active={tab === 'terminals'} onClick={() => setTab('terminals')}>
                终端
                {terminals.length > 0 ? (
                  <span className="ml-1 text-[10px] text-primary">{terminals.length}</span>
                ) : null}
              </RailTabButton>
            </>
          ) : null}
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
            className={`${open ? 'ml-auto' : ''} rounded-md p-1.5 text-text-dim hover:bg-hover hover:text-text`}
            title={open ? '收起侧栏' : '展开节点 / 终端'}
            aria-label={open ? '收起右侧栏' : '展开右侧栏'}
            aria-pressed={open}
          >
            <PanelRightIcon open={open} />
          </button>
        </div>

        {open && tab === 'nodes' ? (
          <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
            <div className="mb-2 flex items-center justify-between px-1">
              <div className="font-mono text-[10px] uppercase tracking-wider text-text-dim">
                {workspaces.active?.name ?? '工作空间'}
              </div>
              <button
                type="button"
                onClick={() => setHostOpen(true)}
                className="font-mono text-[11px] text-primary hover:brightness-110"
              >
                添加主机
              </button>
            </div>
            {nodes.length === 0 ? (
              <div className="px-1 font-mono text-xs text-text-dim">还没有主机节点。</div>
            ) : (
              nodes.map((node) => {
                const selected = node.id === (selectedNode?.id ?? '')
                return (
                  <div
                    key={node.id}
                    className={`mb-1 flex items-center gap-1 rounded px-1 py-0.5 ${
                      selected ? 'bg-primary/15 text-primary' : 'text-text-dim'
                    }`}
                  >
                    <button
                      type="button"
                      className="flex min-w-0 flex-1 items-center gap-2 rounded px-1 py-1.5 text-left text-xs hover:bg-hover hover:text-text"
                      title={node.error || node.address || node.name}
                      onClick={() => selectNode(node)}
                      onDoubleClick={() => {
                        selectNode(node)
                        setTab('topology')
                      }}
                    >
                      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${statusDot(node.status)}`} />
                      <Icon name={nodeIcon(node.kind)} size={14} />
                      <span className="min-w-0 flex-1 truncate">{node.name}</span>
                      {node.openPorts && node.openPorts.length > 0 ? (
                        <span className="shrink-0 font-mono text-[10px] text-text-dim">
                          {node.openPorts.length}p
                        </span>
                      ) : null}
                    </button>
                    <button
                      type="button"
                      className="shrink-0 rounded p-1 hover:bg-hover hover:text-text"
                      title="拓扑预览"
                      aria-label={`查看 ${node.name} 拓扑`}
                      onClick={() => {
                        selectNode(node)
                        setTab('topology')
                      }}
                    >
                      <Icon name="hierarchy" size={14} />
                    </button>
                    {node.kind !== 'local' ? (
                      <>
                        <button
                          type="button"
                          className="shrink-0 rounded p-1 hover:bg-hover hover:text-text"
                          title="重新连接"
                          aria-label={`重新连接 ${node.name}`}
                          onClick={() => void workspaces.connectNode(workspaces.activeId, node.id)}
                        >
                          <Icon name="link" size={14} />
                        </button>
                        <button
                          type="button"
                          className="shrink-0 rounded p-1 text-text-dim hover:bg-hover hover:text-error"
                          title="移除节点"
                          aria-label={`移除 ${node.name}`}
                          onClick={() => void workspaces.removeNode(workspaces.activeId, node.id)}
                        >
                          <Icon name="close-circle" size={14} />
                        </button>
                      </>
                    ) : null}
                  </div>
                )
              })
            )}
          </div>
        ) : null}

        {open && tab === 'topology' ? (
          <div className="min-h-0 flex-1">
            {selectedNode ? (
              <NodeSurfacePanel
                embedded
                workspaceId={workspaces.activeId}
                node={selectedNode}
                onProbed={() => void workspaces.refresh()}
              />
            ) : (
              <div className="px-3 py-4 font-mono text-xs text-text-dim">先在「节点」里选择一台主机。</div>
            )}
          </div>
        ) : null}

        {open && tab === 'terminals' ? (
          <div className="flex min-h-0 flex-1 flex-col">
            <div className="max-h-40 shrink-0 overflow-y-auto border-b border-border px-2 py-2">
              {terminalError ? (
                <div className="px-1 font-mono text-xs text-warning">{terminalError}</div>
              ) : terminals.length === 0 ? (
                <div className="px-1 font-mono text-xs text-text-dim">
                  还没有受控终端。Secbot 用 terminal_session 打开的会话会出现在这里。
                </div>
              ) : (
                terminals.map((item) => (
                  <button
                    key={item.session_id}
                    type="button"
                    onClick={() => setSelectedTerminal(item.session_id)}
                    className={`mb-1 flex w-full items-center gap-2 rounded px-2 py-1.5 text-left font-mono text-[11px] ${
                      item.session_id === selectedTerminal
                        ? 'bg-primary/15 text-primary'
                        : 'text-text-dim hover:bg-hover hover:text-text'
                    }`}
                  >
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${item.alive ? 'bg-primary' : 'bg-text-dim/40'}`} />
                    <span className="min-w-0 flex-1 truncate">
                      {item.session_id}
                      {item.shell ? ` · ${item.shell}` : ''}
                    </span>
                    <span className="shrink-0 text-[10px]">{item.alive ? 'live' : 'exit'}</span>
                  </button>
                ))
              )}
            </div>
            {activeTerminal ? (
              <div className="flex min-h-0 flex-1 flex-col">
                <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2 font-mono text-[10px] text-text-dim">
                  <span className="min-w-0 truncate">
                    pid {activeTerminal.pid ?? '—'}
                    {activeTerminal.cwd ? ` · ${activeTerminal.cwd}` : ''}
                    {activeTerminal.last_command ? ` · $ ${activeTerminal.last_command}` : ''}
                  </span>
                  <button
                    type="button"
                    className="shrink-0 text-error hover:underline"
                    onClick={() => void closeTerminal(activeTerminal.session_id)}
                  >
                    关闭
                  </button>
                </div>
                <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-all bg-bg px-3 py-2 font-mono text-[11px] leading-relaxed text-text">
                  {activeTerminal.preview.trim() || '（暂无输出）'}
                </pre>
              </div>
            ) : null}
          </div>
        ) : null}
      </aside>

      {hostOpen ? (
        <AddHostDialog
          onClose={() => setHostOpen(false)}
          onSubmit={(body) => workspaces.addNode(workspaces.activeId, body).then(() => undefined)}
        />
      ) : null}
    </div>
  )
}

function PanelRightIcon({ open }: { open: boolean }) {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="1.25" y="2.25" width="13.5" height="11.5" rx="1.75" stroke="currentColor" strokeWidth="1.2" />
      <path d="M10.25 2.25v11.5" stroke="currentColor" strokeWidth="1.2" />
      {open ? <rect x="10.25" y="2.25" width="4.5" height="11.5" rx="1.2" fill="currentColor" opacity="0.28" /> : null}
    </svg>
  )
}

function RailTabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`border-b px-2 py-2 font-mono text-[11px] ${
        active ? 'border-primary text-primary' : 'border-transparent text-text-dim hover:text-text'
      }`}
    >
      {children}
    </button>
  )
}
