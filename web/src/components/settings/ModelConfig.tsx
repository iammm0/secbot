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

interface ModelList {
  models: string[]
  error?: string
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, options)
  const payload = await response.json()
  if (!response.ok) {
    throw new Error(payload?.message ?? `请求失败：HTTP ${response.status}`)
  }
  return (payload.data ?? payload) as T
}

function choosePreferredModel(models: string[], current: string): string {
  if (current && models.includes(current)) return current
  const preferred = [
    'gpt-5.6-sol',
    'gpt-5.6',
    'gpt-5.4',
    'gpt-5.2',
    'gpt-5',
    'gpt-5-mini',
    'deepseek-chat',
    'gpt-4o-mini',
    'llama3.2',
  ]
  return preferred.find(item => models.includes(item)) ?? models[0] ?? current
}

export function ModelConfig() {
  const [providers, setProviders] = useState<Provider[]>([])
  const [config, setConfig] = useState<Config | null>(null)
  const [apiKey, setApiKey] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [model, setModel] = useState('')
  const [models, setModels] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [probing, setProbing] = useState(false)
  const [modelError, setModelError] = useState('')
  const [message, setMessage] = useState('')

  const loadProvider = async (id: string) => {
    const detail = await request<{ model?: string | null; base_url?: string | null }>(
      `/api/system/config/provider/${id}`,
    )
    setBaseUrl(detail.base_url ?? '')
    const currentModel = detail.model ?? ''
    setModel(currentModel)
    setConfig(previous =>
      previous?.llm_provider === id
        ? {
            ...previous,
            current_provider_model: currentModel || null,
            current_provider_base_url: detail.base_url ?? null,
          }
        : previous,
    )
    setProbing(true)
    try {
      const available = await request<ModelList>(`/api/system/config/provider/${id}/models`)
      setModels(available.models ?? [])
      setModelError(available.error ?? '')
      setModel(choosePreferredModel(available.models ?? [], currentModel))
      return available
    } finally {
      setProbing(false)
    }
  }

  useEffect(() => {
    request<{ providers: Provider[] }>('/api/system/config/providers')
      .then(data => setProviders(data.providers ?? []))
      .catch(error => setMessage(String((error as Error).message)))
    request<Config>('/api/system/config').then(c => {
      setConfig(c)
      setBaseUrl(c.current_provider_base_url ?? '')
      setModel(c.current_provider_model ?? '')
      loadProvider(c.llm_provider).catch(error => {
        setModels([])
        setModelError(String((error as Error).message))
      })
    })
  }, [])

  const activeProvider = config?.llm_provider ?? ''
  const activeProviderMeta = providers.find(provider => provider.id === activeProvider)

  const selectProvider = async (id: string) => {
    if (id === activeProvider) return
    const provider = providers.find(item => item.id === id)
    if (!window.confirm(`是否将默认推理后端切换为“${provider?.name ?? id}”？`)) return
    await request<{ success: boolean; message: string }>('/api/system/config/provider', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ llm_provider: id }),
    })
    setConfig(prev => prev ? { ...prev, llm_provider: id } : prev)
    setApiKey('')
    try {
      await loadProvider(id)
    } catch (error) {
      setModels([])
      setModelError(String((error as Error).message))
    }
    setMessage(`已切换至 ${id}`)
    setTimeout(() => setMessage(''), 2000)
  }

  const saveConnectionAndProbe = async () => {
    setSaving(true)
    try {
      if (apiKey) {
        await request('/api/system/config/api-key', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider: activeProvider, apiKey, baseUrl }),
        })
      } else {
        await request('/api/system/config/provider-settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider: activeProvider, base_url: baseUrl }),
        })
      }

      const discovered = await loadProvider(activeProvider)
      const selectedModel = discovered.models.includes(model)
        ? model
        : choosePreferredModel(discovered.models, model)
      if (selectedModel) {
        await request('/api/system/config/provider-settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ provider: activeProvider, model: selectedModel }),
        })
      }
      setModel(selectedModel)
      setMessage(discovered.error ? `连接已保存，但${discovered.error}` : `已探测到 ${discovered.models.length} 个模型`)
      setApiKey('')
    } catch (error) {
      setMessage(String((error as Error).message))
    } finally {
      setSaving(false)
    }
  }

  const saveSelectedModel = async () => {
    if (!model) return
    setSaving(true)
    try {
      await request('/api/system/config/provider-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: activeProvider, model }),
      })
      setConfig(previous => previous ? { ...previous, current_provider_model: model } : previous)
      setMessage(`已切换模型为 ${model}`)
    } catch (error) {
      setMessage(String((error as Error).message))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-xs uppercase tracking-wider text-text-dim mb-2">
          ① 切换推理后端
        </h3>
        <div className="flex flex-wrap gap-2">
          {providers.map(p => (
            <button
              type="button"
              key={p.id}
              onClick={() => selectProvider(p.id)}
              className={`px-3 py-1.5 rounded text-xs font-mono transition-all ${
                p.id === activeProvider
                  ? 'bg-primary/20 text-primary border border-primary/40'
                  : 'bg-white/5 text-text-dim border border-white/10 hover:border-white/20'
              }`}
            >
              {p.name}
              {p.id === activeProvider && <span className="ml-1">✓</span>}
              {p.configured && p.id !== activeProvider && <span className="ml-1 text-primary">●</span>}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="text-xs uppercase tracking-wider text-text-dim">
          ② 配置连接并探测模型
        </h3>
        {activeProviderMeta?.needs_api_key && (
          <div>
            <label className="text-xs text-text-dim block mb-1">API 密钥</label>
            <input
              type="password"
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              placeholder={activeProviderMeta.configured ? '已配置；留空表示不修改' : '请输入 API Key'}
              className="w-full px-3 py-2 rounded bg-white/5 border border-white/10 text-sm font-mono text-text focus:border-primary/40 focus:outline-none"
            />
          </div>
        )}
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
        <button
          type="button"
          onClick={saveConnectionAndProbe}
          disabled={saving || probing || !activeProvider}
          className="px-4 py-2 rounded text-xs font-mono bg-primary/20 text-primary border border-primary/40 hover:bg-primary/30 transition-colors disabled:opacity-50"
        >
          {saving ? '保存中...' : probing ? '探测中...' : '保存连接并探测模型'}
        </button>
      </div>

      <div className="space-y-3">
        <h3 className="text-xs uppercase tracking-wider text-text-dim">
          ③ 选择模型
        </h3>
        <div>
          <label className="text-xs text-text-dim block mb-1">
            可用模型 {models.length > 0 ? `（${models.length} 个）` : ''}
          </label>
          <select
            value={model}
            onChange={e => setModel(e.target.value)}
            disabled={models.length === 0 || probing}
            className="w-full px-3 py-2 rounded bg-white/5 border border-white/10 text-sm font-mono text-text focus:border-primary/40 focus:outline-none"
          >
            {models.length === 0 && (
              <option value={model}>{probing ? '探测中...' : model || '请先保存连接并探测'}</option>
            )}
            {models.map(item => (
              <option key={item} value={item}>
                {item}{item === config?.current_provider_model ? '（当前）' : ''}
              </option>
            ))}
          </select>
          {modelError && <p className="mt-1 text-xs text-red-400">{modelError}</p>}
        </div>
        <button
          type="button"
          onClick={saveSelectedModel}
          disabled={saving || models.length === 0 || !model}
          className="px-4 py-2 rounded text-xs font-mono bg-primary/20 text-primary border border-primary/40 hover:bg-primary/30 transition-colors disabled:opacity-50"
        >
          {saving ? '保存中...' : '应用所选模型'}
        </button>
        {message && <span className="ml-3 text-xs text-primary">{message}</span>}
      </div>
    </div>
  )
}
