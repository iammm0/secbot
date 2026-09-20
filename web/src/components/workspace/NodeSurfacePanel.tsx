import { useEffect, useMemo, useState } from 'react'
import { Icon } from '@/components/Icon'
import {
  fetchNodeSurface,
  probeWorkspaceNode,
  type AttackChainStep,
  type NodeSurfacePreview,
  type WorkspaceNode,
} from '@/lib/workspaceApi'

interface Props {
  workspaceId: string
  node: WorkspaceNode
  onClose: () => void
  onProbed?: (node: WorkspaceNode) => void
}

export function NodeSurfacePanel({ workspaceId, node, onClose, onProbed }: Props) {
  const [preview, setPreview] = useState<NodeSurfacePreview | null>(null)
  const [loading, setLoading] = useState(true)
  const [probing, setProbing] = useState(false)
  const [error, setError] = useState('')

  const current = preview?.node ?? node
  const ports = current.openPorts ?? []
  const services = current.services ?? {}

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      setPreview(await fetchNodeSurface(workspaceId, node.id))
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败')
      setPreview({
        node,
        attackChain: [],
      })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [workspaceId, node.id])

  const probe = async () => {
    setProbing(true)
    setError('')
    try {
      const next = await probeWorkspaceNode(workspaceId, node.id)
      setPreview(next)
      onProbed?.(next.node)
    } catch (err) {
      setError(err instanceof Error ? err.message : '探测失败')
    } finally {
      setProbing(false)
    }
  }

  const portNodes = useMemo(() => {
    const list = ports.length > 0 ? ports : []
    return list.map((port, index) => {
      const angle = list.length === 1 ? -90 : -90 + (360 / list.length) * index
      const rad = (angle * Math.PI) / 180
      const radius = 118
      return {
        port,
        service: services[String(port)] || 'svc',
        x: 160 + Math.cos(rad) * radius,
        y: 140 + Math.sin(rad) * radius,
      }
    })
  }, [ports, services])

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-end bg-black/40 backdrop-blur-[1px]">
      <button type="button" className="flex-1 cursor-default" aria-label="关闭" onClick={onClose} />
      <aside className="flex h-full w-full max-w-xl flex-col border-l border-border bg-bg shadow-2xl">
        <header className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <div className="font-mono text-sm text-text">节点探测 · 攻击链预览</div>
            <div className="mt-0.5 font-mono text-[11px] text-text-dim">{current.name}</div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={probing}
              onClick={() => void probe()}
              className="rounded-lg bg-primary px-3 py-1.5 font-mono text-xs text-bg hover:brightness-110 disabled:opacity-50"
            >
              {probing ? '探测中…' : '探测'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-border px-2 py-1.5 text-text-dim hover:bg-hover hover:text-text"
              aria-label="关闭面板"
            >
              <Icon name="close-circle" size={16} />
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 space-y-6">
          {loading ? (
            <div className="font-mono text-xs text-text-dim">加载拓扑…</div>
          ) : (
            <>
              <section>
                <div className="mb-3 font-mono text-[11px] uppercase tracking-wider text-text-dim">
                  主机状态
                </div>
                <div className="relative mx-auto h-[280px] w-[320px]">
                  <svg viewBox="0 0 320 280" className="h-full w-full overflow-visible">
                    <defs>
                      <radialGradient id="hostGlow" cx="50%" cy="50%" r="50%">
                        <stop offset="0%" stopColor="var(--color-primary)" stopOpacity="0.22" />
                        <stop offset="100%" stopColor="var(--color-primary)" stopOpacity="0" />
                      </radialGradient>
                    </defs>
                    <circle cx="160" cy="140" r="96" fill="url(#hostGlow)" />
                    {portNodes.map((item) => (
                      <g key={item.port}>
                        <line
                          x1="160"
                          y1="140"
                          x2={item.x}
                          y2={item.y}
                          stroke="var(--color-border)"
                          strokeWidth="1.2"
                          strokeDasharray="3 3"
                        >
                          <animate
                            attributeName="stroke-opacity"
                            values="0.35;1;0.35"
                            dur="2.4s"
                            repeatCount="indefinite"
                          />
                        </line>
                        <circle
                          cx={item.x}
                          cy={item.y}
                          r="18"
                          fill="var(--color-hover)"
                          stroke="var(--color-primary)"
                          strokeWidth="1.5"
                        />
                        <text
                          x={item.x}
                          y={item.y - 2}
                          textAnchor="middle"
                          className="fill-[var(--color-text)]"
                          style={{ fontSize: 10, fontFamily: 'ui-monospace, monospace' }}
                        >
                          {item.port}
                        </text>
                        <text
                          x={item.x}
                          y={item.y + 10}
                          textAnchor="middle"
                          className="fill-[var(--color-text-dim)]"
                          style={{ fontSize: 8, fontFamily: 'ui-monospace, monospace' }}
                        >
                          {item.service}
                        </text>
                      </g>
                    ))}

                    {/* Computer glyph */}
                    <g transform="translate(118, 98)">
                      <rect
                        x="0"
                        y="0"
                        width="84"
                        height="56"
                        rx="6"
                        fill="var(--color-bg)"
                        stroke="var(--color-primary)"
                        strokeWidth="1.8"
                      />
                      <rect x="8" y="8" width="68" height="34" rx="2" fill="var(--color-hover)" />
                      <rect x="28" y="58" width="28" height="6" rx="1" fill="var(--color-primary)" opacity="0.7" />
                      <rect x="18" y="66" width="48" height="4" rx="1" fill="var(--color-border)" />
                    </g>
                    <text
                      x="160"
                      y="188"
                      textAnchor="middle"
                      className="fill-[var(--color-text)]"
                      style={{ fontSize: 11, fontFamily: 'ui-monospace, monospace', fontWeight: 600 }}
                    >
                      {current.hostname || current.name}
                    </text>
                  </svg>
                  {ports.length === 0 ? (
                    <div className="pointer-events-none absolute inset-x-0 bottom-2 text-center font-mono text-[11px] text-text-dim">
                      暂无开放端口 · 点击探测
                    </div>
                  ) : null}
                </div>

                <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 font-mono text-xs">
                  <div>
                    <dt className="text-text-dim">IP</dt>
                    <dd className="text-text">{current.ip || current.address || '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-text-dim">用户</dt>
                    <dd className="text-text">{current.username || '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-text-dim">系统</dt>
                    <dd className="text-text">{current.osType || '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-text-dim">状态</dt>
                    <dd className="text-text">{current.status}</dd>
                  </div>
                </dl>
              </section>

              <section>
                <div className="mb-3 font-mono text-[11px] uppercase tracking-wider text-text-dim">
                  攻击链模拟预览
                </div>
                <p className="mb-3 text-xs text-text-dim">
                  基于已探测服务面生成的路径预览，不执行任何攻击动作。
                </p>
                <ol className="space-y-0">
                  {(preview?.attackChain ?? []).map((step, index, arr) => (
                    <AttackStepRow key={step.id} step={step} isLast={index === arr.length - 1} />
                  ))}
                </ol>
              </section>
            </>
          )}
          {error ? <div className="font-mono text-xs text-warning">{error}</div> : null}
        </div>
      </aside>
    </div>
  )
}

function AttackStepRow({ step, isLast }: { step: AttackChainStep; isLast: boolean }) {
  return (
    <li className="flex gap-3">
      <div className="flex w-4 flex-col items-center">
        <span
          className={`mt-1 h-2.5 w-2.5 rounded-full ${
            step.status === 'done'
              ? 'bg-primary'
              : step.status === 'active'
                ? 'bg-warning'
                : step.status === 'preview'
                  ? 'bg-primary/40'
                  : 'bg-border'
          }`}
        />
        {!isLast ? <span className="mt-1 w-px flex-1 bg-border" /> : null}
      </div>
      <div className={`min-w-0 flex-1 ${isLast ? 'pb-0' : 'pb-4'}`}>
        <div className="font-mono text-xs text-text">{step.label}</div>
        <div className="mt-0.5 font-mono text-[11px] text-text-dim">{step.detail}</div>
      </div>
    </li>
  )
}
