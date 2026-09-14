import { type FormEvent, useState } from 'react'
import type { WorkspaceNodeKind } from '@/lib/workspaceApi'
import { Modal } from './CreateWorkspaceDialog'

interface Props {
  onClose: () => void
  onSubmit: (body: {
    name: string
    kind: Exclude<WorkspaceNodeKind, 'local'>
    address: string
    username?: string
    password?: string
  }) => Promise<void>
}

export function AddHostDialog({ onClose, onSubmit }: Props) {
  const [kind, setKind] = useState<Exclude<WorkspaceNodeKind, 'local'>>('secbot')
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!name.trim() || !address.trim()) return
    setSaving(true)
    setError(null)
    try {
      await onSubmit({
        name: name.trim(),
        kind,
        address: address.trim(),
        username: kind === 'ssh' ? username.trim() || undefined : undefined,
        password: kind === 'ssh' ? password || undefined : undefined,
      })
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : '添加失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title="添加主机节点" onClose={onClose}>
      <form className="space-y-3" onSubmit={(event) => void submit(event)}>
        <div className="flex gap-2">
          {([
            ['secbot', 'Secbot 节点'],
            ['ssh', 'SSH 主机'],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setKind(id)}
              className={`flex-1 rounded border px-2 py-1.5 font-mono text-xs ${
                kind === id
                  ? 'border-primary bg-primary/10 text-primary'
                  : 'border-border text-text-dim hover:bg-hover'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        <label className="block text-xs text-text-dim">
          显示名称
          <input
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="mt-1 w-full rounded border border-border bg-hover px-3 py-2 font-mono text-sm text-text outline-none focus:border-primary/40"
            placeholder={kind === 'secbot' ? '实验室后端' : '靶机-1'}
          />
        </label>
        <label className="block text-xs text-text-dim">
          {kind === 'secbot' ? 'API 地址' : 'SSH 地址'}
          <input
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            className="mt-1 w-full rounded border border-border bg-hover px-3 py-2 font-mono text-sm text-text outline-none focus:border-primary/40"
            placeholder={kind === 'secbot' ? 'http://192.168.1.20:8000' : '10.0.0.8:22'}
          />
        </label>
        {kind === 'ssh' ? (
          <>
            <label className="block text-xs text-text-dim">
              用户名
              <input
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                className="mt-1 w-full rounded border border-border bg-hover px-3 py-2 font-mono text-sm text-text outline-none focus:border-primary/40"
                placeholder="root"
              />
            </label>
            <label className="block text-xs text-text-dim">
              密码（可选，也可用本机已授权凭据）
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="mt-1 w-full rounded border border-border bg-hover px-3 py-2 font-mono text-sm text-text outline-none focus:border-primary/40"
              />
            </label>
          </>
        ) : (
          <p className="text-[11px] text-text-dim">会请求该节点的 /health，确认是一台可连的 Secbot 后端。</p>
        )}
        {error ? <p className="text-xs text-error">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <button type="button" className="rounded px-3 py-1.5 text-xs text-text-dim hover:bg-hover" onClick={onClose}>
            取消
          </button>
          <button
            type="submit"
            disabled={saving || !name.trim() || !address.trim() || (kind === 'ssh' && !username.trim())}
            className="rounded border border-primary/40 bg-primary/15 px-3 py-1.5 font-mono text-xs text-primary disabled:opacity-50"
          >
            {saving ? '连接中…' : '连接并添加'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
