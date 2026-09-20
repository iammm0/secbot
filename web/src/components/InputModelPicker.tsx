import { useEffect, useRef, useState } from 'react'
import { Icon } from '@/components/Icon'

type Config = {
  llm_provider: string
  current_provider_model: string | null
}

async function api<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options)
  const payload = await response.json()
  if (!response.ok) {
    throw new Error(payload?.message ?? `请求失败：HTTP ${response.status}`)
  }
  return (payload.data ?? payload) as T
}

function shortModel(name: string): string {
  if (name.length <= 22) return name
  return `${name.slice(0, 10)}…${name.slice(-8)}`
}

export function InputModelPicker({ disabled = false }: { disabled?: boolean }) {
  const [open, setOpen] = useState(false)
  const [provider, setProvider] = useState('')
  const [model, setModel] = useState('')
  const [models, setModels] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const config = await api<Config>('/api/system/config')
      const active = config.llm_provider
      setProvider(active)
      setModel(config.current_provider_model ?? '')
      if (active) {
        const list = await api<{ models: string[] }>(`/api/system/config/provider/${active}/models`)
        setModels(list.models ?? [])
      } else {
        setModels([])
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  useEffect(() => {
    if (!open) return
    void load()
    const onDoc = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  const selectModel = async (next: string) => {
    if (!provider || next === model) {
      setOpen(false)
      return
    }
    setSaving(true)
    setError('')
    try {
      await api('/api/system/config/provider-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider, model: next }),
      })
      setModel(next)
      setOpen(false)
      window.dispatchEvent(new CustomEvent('secbot-model-changed', { detail: { model: next } }))
    } catch (err) {
      setError(err instanceof Error ? err.message : '切换失败')
    } finally {
      setSaving(false)
    }
  }

  const label = model ? shortModel(model) : loading ? '加载中' : '选择模型'

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        disabled={disabled || saving}
        onClick={() => setOpen(value => !value)}
        className={`inline-flex max-w-[11rem] items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[11px] transition-all ${
          open
            ? 'border-primary/50 bg-primary/15 text-primary'
            : 'border-border bg-hover/80 text-text-dim hover:border-primary/30 hover:text-text'
        } disabled:opacity-50`}
        title={model || '切换模型'}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <Icon name="cpu" size={12} className="shrink-0 opacity-80" />
        <span className="truncate">{label}</span>
        <Icon
          name="arrow-down-01"
          size={10}
          className={`shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open ? (
        <div className="absolute bottom-full left-0 z-50 mb-2 w-64 overflow-hidden rounded-xl border border-border bg-popover shadow-xl animate-fade-in-up">
          <div className="border-b border-border px-3 py-2 font-mono text-[10px] uppercase tracking-wider text-text-dim">
            当前后端 · {provider || '—'}
          </div>
          <div className="max-h-56 overflow-y-auto py-1" role="listbox">
            {loading ? (
              <div className="px-3 py-3 font-mono text-xs text-text-dim">探测模型中…</div>
            ) : models.length === 0 ? (
              <div className="px-3 py-3 font-mono text-xs text-text-dim">
                暂无模型。请先在设置里配置并探测。
              </div>
            ) : (
              models.map(item => {
                const active = item === model
                return (
                  <button
                    key={item}
                    type="button"
                    role="option"
                    aria-selected={active}
                    disabled={saving}
                    onClick={() => void selectModel(item)}
                    className={`flex w-full items-center gap-2 px-3 py-2 text-left font-mono text-xs transition-colors ${
                      active
                        ? 'bg-primary/15 text-primary'
                        : 'text-text-dim hover:bg-hover hover:text-text'
                    }`}
                  >
                    <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${active ? 'bg-primary' : 'bg-border'}`} />
                    <span className="min-w-0 truncate">{item}</span>
                  </button>
                )
              })
            )}
          </div>
          {error ? (
            <div className="border-t border-border px-3 py-2 font-mono text-[10px] text-warning">{error}</div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
