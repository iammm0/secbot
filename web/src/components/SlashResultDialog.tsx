import { useEffect, useState } from 'react'

interface Props {
  title: string
  load: () => Promise<string>
  onClose: () => void
}

export function SlashResultDialog({ title, load, onClose }: Props) {
  const [content, setContent] = useState('加载中…')

  useEffect(() => {
    let cancelled = false
    void load()
      .then(text => {
        if (!cancelled) setContent(text || '(空)')
      })
      .catch(error => {
        if (!cancelled) setContent(error instanceof Error ? error.message : '加载失败')
      })
    return () => {
      cancelled = true
    }
  }, [load])

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center p-4">
      <button type="button" className="absolute inset-0 z-0 bg-overlay" aria-label="关闭" onClick={onClose} />
      <div className="relative z-10 flex max-h-[min(80vh,640px)] w-full max-w-2xl flex-col overflow-hidden rounded-xl border border-border bg-popover shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="font-mono text-sm font-semibold text-primary">{title}</h2>
          <button type="button" className="text-text-dim hover:text-text" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </div>
        <pre className="flex-1 overflow-auto whitespace-pre-wrap px-4 py-3 font-mono text-xs leading-relaxed text-text">
          {content}
        </pre>
      </div>
    </div>
  )
}
