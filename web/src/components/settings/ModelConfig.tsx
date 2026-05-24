import { useEffect, useState } from 'react'

interface Provider {
  id: string
  name: string
  needs_api_key: boolean
  configured: boolean
  needs_base_url: boolean
  has_base_url: boolean
}

interface Config {
  llm_provider: string
  current_provider_model: string | null
  current_provider_base_url: string | null
}

export function ModelConfig() {
  const [providers, setProviders] = useState<Provider[]>([])
  const [config, setConfig] = useState<Config | null>(null)
  const [apiKey, setApiKey] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [model, setModel] = useState('')
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    fetch('/api/system/config/providers').then(r => r.json()).then(d => setProviders(d.data?.providers ?? d.providers ?? []))
    fetch('/api/system/config').then(r => r.json()).then(d => {
      const c = d.data ?? d
      setConfig(c)
      setBaseUrl(c.current_provider_base_url ?? '')
      setModel(c.current_provider_model ?? '')
    })
  }, [])

  const activeProvider = config?.llm_provider ?? ''

  const selectProvider = async (id: string) => {
    await fetch('/api/system/config/provider', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ provider: id }),
    })
    setConfig(prev => prev ? { ...prev, llm_provider: id } : prev)
    setMessage(`已切换至 ${id}`)
    setTimeout(() => setMessage(''), 2000)
  }

  const saveSettings = async () => {
    setSaving(true)
    try {
      if (apiKey) {
        await fetch('/api/system/config/api-key', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider: activeProvider, api_key: apiKey }),
        })
      }
      await fetch('/api/system/config/provider-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: activeProvider, model: model || undefined, base_url: baseUrl || undefined }),
      })
      setMessage('已保存')
      setApiKey('')
      setTimeout(() => setMessage(''), 2000)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-xs uppercase tracking-wider text-text-dim mb-2">模型提供商</h3>
        <div className="flex flex-wrap gap-2">
          {providers.map(p => (
            <button
              key={p.id}
              onClick={() => selectProvider(p.id)}
              className={`px-3 py-1.5 rounded text-xs font-mono transition-all ${
                p.id === activeProvider
                  ? 'bg-primary/20 text-primary border border-primary/40'
                  : 'bg-white/5 text-text-dim border border-white/10 hover:border-white/20'
              }`}
            >
              {p.name}
              {p.configured && <span className="ml-1 text-primary">●</span>}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="text-xs uppercase tracking-wider text-text-dim">连接配置</h3>
        <div>
          <label className="text-xs text-text-dim block mb-1">API 密钥</label>
          <input
            type="password"
            value={apiKey}
            onChange={e => setApiKey(e.target.value)}
            placeholder="sk-..."
            className="w-full px-3 py-2 rounded bg-white/5 border border-white/10 text-sm font-mono text-text focus:border-primary/40 focus:outline-none"
          />
        </div>
        <div>
          <label className="text-xs text-text-dim block mb-1">接口地址</label>
          <input
            type="text"
            value={baseUrl}
            onChange={e => setBaseUrl(e.target.value)}
            placeholder="https://api.openai.com"
            className="w-full px-3 py-2 rounded bg-white/5 border border-white/10 text-sm font-mono text-text focus:border-primary/40 focus:outline-none"
          />
        </div>
        <div>
          <label className="text-xs text-text-dim block mb-1">模型名称</label>
          <input
            type="text"
            value={model}
            onChange={e => setModel(e.target.value)}
            placeholder="gpt-4o-mini"
            className="w-full px-3 py-2 rounded bg-white/5 border border-white/10 text-sm font-mono text-text focus:border-primary/40 focus:outline-none"
          />
        </div>
        <button
          onClick={saveSettings}
          disabled={saving}
          className="px-4 py-2 rounded text-xs font-mono bg-primary/20 text-primary border border-primary/40 hover:bg-primary/30 transition-colors disabled:opacity-50"
        >
          {saving ? '保存中...' : '保存'}
        </button>
        {message && <span className="ml-3 text-xs text-primary">{message}</span>}
      </div>
    </div>
  )
}
