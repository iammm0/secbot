import { useEffect, useState } from 'react'
import { ConfirmDialog } from '@/components/ConfirmDialog'

interface ClientStatus {
  installed: boolean
  path?: string
  mcp_registered: boolean
}

interface ExternalStatus {
  claude_code: ClientStatus
  codex: ClientStatus
  secbot_command: { command: string; args: string[] }
  acp_command: { command: string; args: string[] }
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options)
  const payload = await response.json()
  if (!response.ok) {
    throw new Error(payload?.message ?? `请求失败：HTTP ${response.status}`)
  }
  return (payload.data ?? payload) as T
}

function launchLabel(spec: { command: string; args: string[] }): string {
  return [spec.command, ...spec.args].join(' ')
}

export function IntegrationConfig() {
  const [status, setStatus] = useState<ExternalStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [pendingReg, setPendingReg] = useState<'claude' | 'codex' | null>(null)

  const load = async () => {
    setLoading(true)
    setMessage('')
    try {
      setStatus(await request<ExternalStatus>('/api/system/external-integration'))
    } catch (error) {
      setMessage(`读取外部集成状态失败：${String((error as Error).message)}`)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const confirmRegister = async () => {
    if (!pendingReg) return
    setSaving(true)
    setMessage('')
    try {
      const endpoint = pendingReg === 'claude' ? 'claude-mcp' : 'codex-mcp'
      const result = await request<{ success: boolean; message: string }>(
        `/api/system/external-integration/${endpoint}`,
        { method: 'POST' },
      )
      setMessage(result.message)
      setPendingReg(null)
      await load()
    } catch (error) {
      setMessage(`注册失败：${String((error as Error).message)}`)
      setPendingReg(null)
    } finally {
      setSaving(false)
    }
  }

  const copyCommand = async (spec: { command: string; args: string[] }) => {
    const text = launchLabel(spec)
    try {
      await navigator.clipboard.writeText(text)
      setMessage(`已复制启动命令：${text}`)
    } catch {
      setMessage(`复制失败，请手动复制：${text}`)
    }
  }

  const renderClientCard = (title: string, client: ClientStatus, regKind: 'claude' | 'codex') => (
    <div className="rounded-lg border border-border bg-hover px-3 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="font-mono text-xs text-text">
            {title}
            <span className={client.installed ? 'text-primary' : 'text-text-dim'}>
              {client.installed ? ' · 已安装' : ' · 未检测到'}
            </span>
          </div>
          <div className="mt-0.5 truncate text-[11px] text-text-dim">
            {client.installed ? (client.path ?? '') : 'PATH 中未找到对应 CLI'}
          </div>
          <div className="mt-0.5 font-mono text-[11px] text-text-dim">
            secbot MCP：{client.mcp_registered ? '已注册' : '未注册'}
          </div>
        </div>
        {client.installed && !client.mcp_registered ? (
          <button
            type="button"
            disabled={saving}
            onClick={() => setPendingReg(regKind)}
            className="shrink-0 rounded border border-primary/40 bg-primary/15 px-2.5 py-1 font-mono text-[11px] text-primary hover:bg-primary/25 disabled:opacity-50"
          >
            一键注册
          </button>
        ) : null}
      </div>
    </div>
  )

  return (
    <div className="space-y-4">
      <div>
        <h3 className="mb-1 text-xs uppercase tracking-wider text-text-dim">外部集成</h3>
        <p className="text-[11px] leading-relaxed text-text-dim">
          本机已安装 Secbot 时，可把 Secbot 作为外部工具 / 外部 agent 提供给 Claude Code 与 Codex
          使用：通过 MCP 暴露为工具（
          <span className="font-mono text-primary">mcp__secbot__*</span>），或通过 ACP 暴露为外部 agent。
          注册会写入本机的 <span className="font-mono">~/.claude.json</span> 与{' '}
          <span className="font-mono">~/.codex/config.toml</span>。
        </p>
      </div>

      {message ? (
        <p className="rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 font-mono text-[11px] text-primary">
          {message}
        </p>
      ) : null}

      <div className="space-y-2">
        {status ? (
          <>
            {renderClientCard('Claude Code', status.claude_code, 'claude')}
            {renderClientCard('Codex', status.codex, 'codex')}
          </>
        ) : (
          <p className="rounded-lg border border-dashed border-border px-3 py-4 text-center text-xs text-text-dim">
            {loading ? '探测中…' : '无法读取外部集成状态'}
          </p>
        )}
      </div>

      <div className="rounded-lg border border-border px-3 py-3">
        <h4 className="font-mono text-xs text-text">ACP 外部 agent（面向支持 ACP 的客户端）</h4>
        <p className="mt-1 text-[11px] leading-relaxed text-text-dim">
          面向 Zed、VS Code ACP、JetBrains 等支持 Agent Client Protocol 的客户端，Secbot 可以作为独立
          agent 被拉起。Claude Code 目前不支持 ACP 客户端模式，请用上面的 MCP 方式接入。
        </p>
        <div className="mt-2 flex items-center justify-between gap-3 rounded border border-border bg-hover px-3 py-2">
          <code className="min-w-0 truncate font-mono text-[11px] text-text">
            {status ? launchLabel(status.acp_command) : '探测中…'}
          </code>
          <button
            type="button"
            disabled={!status}
            onClick={() => status && void copyCommand(status.acp_command)}
            className="shrink-0 rounded border border-border px-2 py-1 font-mono text-[11px] text-text-dim hover:text-primary disabled:opacity-50"
          >
            复制
          </button>
        </div>
      </div>

      <button
        type="button"
        onClick={() => void load()}
        disabled={loading}
        className="font-mono text-[11px] text-text-dim hover:text-primary disabled:opacity-50"
      >
        {loading ? '检测中…' : '重新检测'}
      </button>

      {pendingReg ? (
        <ConfirmDialog
          title={`注册 Secbot MCP 到 ${pendingReg === 'claude' ? 'Claude Code' : 'Codex'}`}
          message={`将把 Secbot 的 MCP 服务器写入本机 ${pendingReg === 'claude' ? '~/.claude.json' : '~/.codex/config.toml'}，之后在 ${pendingReg === 'claude' ? 'Claude Code' : 'Codex'} 中即可调用 mcp__secbot__* 工具。确认继续？`}
          confirmLabel="确认注册"
          busy={saving}
          onCancel={() => {
            if (!saving) setPendingReg(null)
          }}
          onConfirm={() => void confirmRegister()}
        />
      ) : null}
    </div>
  )
}
