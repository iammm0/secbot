interface Props {
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  busy?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel = '确认',
  cancelLabel = '取消',
  busy = false,
  onConfirm,
  onCancel,
}: Props) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 z-0 bg-overlay" aria-label={cancelLabel} onClick={onCancel} />
      <div className="relative z-10 w-full max-w-sm rounded-xl border border-border bg-popover p-5 shadow-xl">
        <h2 className="font-mono text-sm font-semibold text-primary">{title}</h2>
        <p className="mt-2 text-sm leading-relaxed text-text">{message}</p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            className="rounded px-3 py-1.5 text-xs text-text-dim hover:bg-hover"
            onClick={onCancel}
            disabled={busy}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            className="rounded border border-primary/40 bg-primary/15 px-3 py-1.5 font-mono text-xs text-primary disabled:opacity-50"
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? '切换中…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
