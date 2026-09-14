import { type FormEvent, type ReactNode, useState } from 'react'

interface Props {
  title: string
  onClose: () => void
  children: ReactNode
}

export function Modal({ title, onClose, children }: Props) {
  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 z-0 bg-overlay" aria-label="关闭" onClick={onClose} />
      <div className="relative z-10 w-full max-w-md rounded-xl border border-border bg-popover p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="font-mono text-sm font-semibold text-primary">{title}</h2>
          <button type="button" className="text-text-dim hover:text-text" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

interface CreateWorkspaceDialogProps {
  onClose: () => void
  onCreate: (name: string) => Promise<void>
}

export function CreateWorkspaceDialog({ onClose, onCreate }: CreateWorkspaceDialogProps) {
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) return
    setSaving(true)
    setError(null)
    try {
      await onCreate(trimmed)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建失败')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title="新建工作空间" onClose={onClose}>
      <form className="space-y-3" onSubmit={(event) => void submit(event)}>
        <label className="block text-xs text-text-dim">
          名称
          <input
            autoFocus
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="mt-1 w-full rounded border border-border bg-hover px-3 py-2 font-mono text-sm text-text outline-none focus:border-primary/40"
            placeholder="例如：内网演练"
          />
        </label>
        {error ? <p className="text-xs text-error">{error}</p> : null}
        <div className="flex justify-end gap-2">
          <button type="button" className="rounded px-3 py-1.5 text-xs text-text-dim hover:bg-hover" onClick={onClose}>
            取消
          </button>
          <button
            type="submit"
            disabled={saving || !name.trim()}
            className="rounded border border-primary/40 bg-primary/15 px-3 py-1.5 font-mono text-xs text-primary disabled:opacity-50"
          >
            {saving ? '创建中…' : '创建'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
