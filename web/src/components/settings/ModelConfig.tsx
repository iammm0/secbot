import { useEffect, useMemo, useState } from 'react'
import { ConfirmDialog } from '@/components/ConfirmDialog'
import { getPreferredAgent, setPreferredAgent } from '@/hooks/useChat'

type InferenceMode = 'online' | 'local'
type ProviderGroup = 'overseas' | 'china' | 'relay' | 'local'

interface Provider {
  id: string
  name: string
  needs_api_key: boolean
  configured: boolean
  needs_base_url: boolean
  has_base_url: boolean
  group?: ProviderGroup
  compat_hint?: string
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

interface LocalCandidate {
  id: string
  source: string
  sourceLabel: string
  app: string
  targetProvider: string
  baseUrl: string
  model: string | null
  maskedApiKey: string
  hasApiKey: boolean
  wireApi: string | null
  isCurrent: boolean
  alreadyImported: boolean
}

const ONLINE_GROUPS: ProviderGroup[] = ['overseas', 'china', 'relay']
const ONLINE_GROUP_LABELS: Record<string, string> = {
  overseas: '海外原生',
  china: '国内原生',
  relay: '中转 / 兼容',
}

function isLocalProvider(provider: Provider): boolean {
  return (provider.group ?? (provider.id === 'ollama' ? 'local' : 'relay')) === 'local'
}

function modeForProvider(providerId: string, providers: Provider[]): InferenceMode {
  const meta = providers.find(item => item.id === providerId)
  if (meta) return isLocalProvider(meta) ? 'local' : 'online'
  return providerId === 'ollama' ? 'local' : 'online'
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
  const [mode, setMode] = useState<InferenceMode>('online')
  const [apiKey, setApiKey] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [model, setModel] = useState('')
  const [models, setModels] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [probing, setProbing] = useState(false)
  const [modelError, setModelError] = useState('')
  const [message, setMessage] = useState('')
  const [pendingProvider, setPendingProvider] = useState<{ id: string; name: string } | null>(null)
  const [agent, setAgent] = useState(getPreferredAgent)
  const [localCandidates, setLocalCandidates] = useState<LocalCandidate[] | null>(null)
  const [localLoading, setLocalLoading] = useState(false)
  const [pendingImport, setPendingImport] = useState<LocalCandidate | null>(null)

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
      .then(data => {
        const list = data.providers ?? []
        setProviders(list)
        return list
      })
      .catch(error => setMessage(String((error as Error).message)))
    request<Config>('/api/system/config').then(c => {
      setConfig(c)
      setBaseUrl(c.current_provider_base_url ?? '')
      setModel(c.current_provider_model ?? '')
      setMode(modeForProvider(c.llm_provider, []))
      loadProvider(c.llm_provider).catch(error => {
        setModels([])
        setModelError(String((error as Error).message))
      })
    })
    void loadLocalCandidates()
  }, [])

  // 「实时读取」：设置页打开期间每 15s 静默重探本机代理，候选无变化时不刷新
  useEffect(() => {
    const timer = window.setInterval(() => void loadLocalCandidates(true), 15000)
    return () => window.clearInterval(timer)
  }, [])

  useEffect(() => {
    if (!config?.llm_provider || providers.length === 0) return
    setMode(modeForProvider(config.llm_provider, providers))
  }, [config?.llm_provider, providers])

  const activeProvider = config?.llm_provider ?? ''
  const activeProviderMeta = providers.find(provider => provider.id === activeProvider)
  const modeProviders = useMemo(
    () => providers.filter(provider => (isLocalProvider(provider) ? 'local' : 'online') === mode),
    [providers, mode],
  )

  const onlineGrouped = useMemo(() => {
    if (mode !== 'online') return []
    return ONLINE_GROUPS.map(group => ({
      group,
      label: ONLINE_GROUP_LABELS[group],
      items: modeProviders.filter(provider => (provider.group ?? 'relay') === group),
    })).filter(section => section.items.length > 0)
  }, [mode, modeProviders])

  const selectProvider = async (id: string) => {
    if (id === activeProvider) return
    setSaving(true)
    try {
      await request<{ success: boolean; message: string }>('/api/system/config/provider', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ llm_provider: id }),
      })
      setConfig(prev => (prev ? { ...prev, llm_provider: id } : prev))
      setApiKey('')
      setMode(modeForProvider(id, providers))
      try {
        await loadProvider(id)
      } catch (error) {
        setModels([])
        setModelError(String((error as Error).message))
      }
      setMessage(`已切换至 ${id}`)
      setTimeout(() => setMessage(''), 2000)
    } catch (error) {
      setMessage(String((error as Error).message))
    } finally {
      setSaving(false)
      setPendingProvider(null)
    }
  }

  const saveConnectionAndProbe = async () => {
    setSaving(true)
    try {
      if (mode === 'online' && apiKey) {
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

  const loadLocalCandidates = async (silent = false) => {
    if (!silent) setLocalLoading(true)
    try {
      const data = await request<{ candidates: LocalCandidate[] }>('/api/system/config/local-providers')
      const next = data.candidates ?? []
      setLocalCandidates(previous => {
        // 静默轮询时若候选无变化则不触发重渲染
        if (silent && previous && JSON.stringify(previous) === JSON.stringify(next)) return previous
        return next
      })
    } catch (error) {
      if (!silent) setMessage(`本机代理探测失败：${String((error as Error).message)}`)
    } finally {
      if (!silent) setLocalLoading(false)
    }
  }

  const confirmImport = async () => {
    if (!pendingImport) return
    setSaving(true)
    setMessage('')
    try {
      await request<{ success: boolean; message: string }>('/api/system/config/import-local-provider', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ candidateId: pendingImport.id, activate: true }),
      })
      setLocalCandidates(previous =>
        (previous ?? []).map(item =>
          item.id === pendingImport.id ? { ...item, alreadyImported: true } : item,
        ),
      )
      setMessage(`已导入本机代理：${pendingImport.sourceLabel}`)
      setPendingImport(null)
      // 导入并切换后刷新厂商列表与当前模型
      void request<{ providers: Provider[] }>('/api/system/config/providers')
        .then(data => setProviders(data.providers ?? []))
        .catch(() => undefined)
      void request<Config>('/api/system/config')
        .then(async c => {
          setConfig(c)
          setModel(c.current_provider_model ?? '')
          setMode(modeForProvider(c.llm_provider, []))
          await loadProvider(c.llm_provider).catch(() => undefined)
        })
        .catch(() => undefined)
    } catch (error) {
      setMessage(`导入失败：${String((error as Error).message)}`)
      setPendingImport(null)
    } finally {
      setSaving(false)
    }
  }

  const activeInCurrentMode = modeProviders.some(provider => provider.id === activeProvider)

  const renderProviderChip = (p: Provider) => (
    <button
      type="button"
      key={p.id}
      onClick={() => {
        if (p.id === activeProvider) return
        setPendingProvider({ id: p.id, name: p.name })
      }}
      className={`px-3 py-1.5 rounded text-xs font-mono transition-all ${
        p.id === activeProvider
          ? 'bg-primary/20 text-primary border border-primary/40'
          : 'bg-hover text-text-dim border border-border hover:border-text-dim/40'
      }`}
    >
      {p.name}
      {p.compat_hint ? <span className="ml-1 text-[10px] opacity-70">{p.compat_hint}</span> : null}
      {p.id === activeProvider && <span className="ml-1">✓</span>}
      {p.configured && p.id !== activeProvider && <span className="ml-1 text-primary">●</span>}
    </button>
  )

  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-xs uppercase tracking-wider text-text-dim mb-2">智能体</h3>
        <div className="flex flex-wrap gap-2">
          {([
            { id: 'hackbot', name: 'Hackbot', hint: '敏感操作需批准' },
            { id: 'superhackbot', name: 'SuperHackbot', hint: '完全自动（含敏感）' },
          ] as const).map(item => (
            <button
              type="button"
              key={item.id}
              onClick={() => {
                setPreferredAgent(item.id)
                setAgent(item.id)
              }}
              className={`px-3 py-1.5 rounded text-xs font-mono transition-all ${
                agent === item.id
                  ? 'bg-primary/20 text-primary border border-primary/40'
                  : 'bg-hover text-text-dim border border-border hover:border-text-dim/40'
              }`}
            >
              {item.name}
              {agent === item.id ? <span className="ml-1">✓</span> : null}
              <span className="ml-2 text-[10px] text-text-dim">{item.hint}</span>
            </button>
          ))}
        </div>
      </div>

      <div>
        <h3 className="text-xs uppercase tracking-wider text-text-dim mb-2">推理方式</h3>
        <div className="flex flex-wrap gap-2">
          {([
            { id: 'online' as const, name: '在线推理', hint: '云端 API（默认）' },
            { id: 'local' as const, name: '本地推理', hint: 'Ollama 等本机模型' },
          ]).map(item => (
            <button
              type="button"
              key={item.id}
              onClick={() => setMode(item.id)}
              className={`px-3 py-1.5 rounded text-xs font-mono transition-all ${
                mode === item.id
                  ? 'bg-primary/20 text-primary border border-primary/40'
                  : 'bg-hover text-text-dim border border-border hover:border-text-dim/40'
              }`}
            >
              {item.name}
              {mode === item.id ? <span className="ml-1">✓</span> : null}
              <span className="ml-2 text-[10px] text-text-dim">{item.hint}</span>
            </button>
          ))}
        </div>
        <p className="mt-2 text-[11px] text-text-dim">
          {mode === 'online'
            ? '在线流程：选择云端厂商 → 填写 API Key（及必要时的 Base URL）→ 探测并选用模型。'
            : '本地流程：选择本机后端（如 Ollama）→ 确认服务地址 → 探测本机已安装模型并选用。'}
        </p>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs uppercase tracking-wider text-text-dim">本机代理导入</h3>
          <button
            type="button"
            onClick={() => void loadLocalCandidates()}
            disabled={localLoading}
            className="font-mono text-[11px] text-text-dim transition-colors hover:text-primary disabled:opacity-50"
          >
            {localLoading ? '探测中…' : '重新检测'}
          </button>
        </div>
        <p className="text-[11px] leading-relaxed text-text-dim">
          实时读取本机已配置的模型代理（cc-switch / Claude Code / Codex），可一键导入使用。
          API Key 仅在本机服务端读取，列表只展示脱敏摘要。
        </p>
        {localCandidates === null ? (
          <p className="text-[11px] text-text-dim">{localLoading ? '正在探测本机代理…' : '本机代理探测中…'}</p>
        ) : localCandidates.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-3 py-3 text-center text-[11px] text-text-dim">
            未检测到本机代理配置。已配置时可在这里一键导入（cc-switch、~/.claude/settings.json、~/.codex/config.toml）。
          </p>
        ) : (
          <div className="space-y-2">
            {localCandidates.map(candidate => (
              <div
                key={candidate.id}
                className="flex items-start justify-between gap-3 rounded-lg border border-border bg-hover px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs text-primary">{candidate.sourceLabel}</span>
                    {candidate.isCurrent ? (
                      <span className="text-[10px] text-text-dim">· 当前启用</span>
                    ) : null}
                    {candidate.alreadyImported ? (
                      <span className="text-[10px] text-primary">· 已导入</span>
                    ) : null}
                  </div>
                  <div className="truncate font-mono text-[11px] text-text-dim">
                    {candidate.baseUrl} · {candidate.maskedApiKey}
                    {candidate.model ? ` · ${candidate.model}` : ''} → {candidate.targetProvider}
                  </div>
                </div>
                {!candidate.alreadyImported ? (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => setPendingImport(candidate)}
                    className="shrink-0 rounded border border-primary/40 bg-primary/15 px-2.5 py-1 font-mono text-[11px] text-primary transition-colors hover:bg-primary/25 disabled:opacity-50"
                  >
                    导入并使用
                  </button>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <h3 className="text-xs uppercase tracking-wider text-text-dim mb-2">
          ① 选择{mode === 'online' ? '在线' : '本地'}后端
        </h3>
        {mode === 'online' ? (
          <div className="space-y-3">
            {onlineGrouped.map(section => (
              <div key={section.group}>
                <div className="mb-1.5 text-[10px] uppercase tracking-wider text-text-dim">
                  {section.label}
                </div>
                <div className="flex flex-wrap gap-2">{section.items.map(renderProviderChip)}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {modeProviders.length === 0 ? (
              <span className="text-xs text-text-dim">暂无本地后端（当前仅支持 Ollama）</span>
            ) : (
              modeProviders.map(renderProviderChip)
            )}
          </div>
        )}
        {!activeInCurrentMode && activeProvider ? (
          <p className="mt-2 text-[11px] text-amber-400/90">
            当前生效后端是「{activeProviderMeta?.name ?? activeProvider}」，属于
            {modeForProvider(activeProvider, providers) === 'online' ? '在线' : '本地'}
            流程。切换本页厂商后才会改用{mode === 'online' ? '在线' : '本地'}推理。
          </p>
        ) : null}
      </div>

      <div className="space-y-3">
        <h3 className="text-xs uppercase tracking-wider text-text-dim">
          ② {mode === 'online' ? '配置云端连接并探测模型' : '确认本地服务并探测模型'}
        </h3>
        {mode === 'online' && activeProviderMeta?.needs_api_key && (
          <div>
            <label className="text-xs text-text-dim block mb-1">API 密钥</label>
            <input
              type="password"
              value={apiKey}
              onChange={e => setApiKey(e.target.value)}
              placeholder={activeProviderMeta.configured ? '已配置；留空表示不修改' : '请输入 API 密钥'}
              className="w-full px-3 py-2 rounded bg-hover border border-border text-sm font-mono text-text focus:border-primary/40 focus:outline-none"
            />
          </div>
        )}
        <div>
          <label className="text-xs text-text-dim block mb-1">
            {mode === 'local' ? 'Ollama 地址' : '接口地址'}
          </label>
          <input
            type="text"
            value={baseUrl}
            onChange={e => setBaseUrl(e.target.value)}
            placeholder={mode === 'local' ? 'http://localhost:11434' : 'https://api.openai.com'}
            className="w-full px-3 py-2 rounded bg-hover border border-border text-sm font-mono text-text focus:border-primary/40 focus:outline-none"
          />
        </div>
        <button
          type="button"
          onClick={saveConnectionAndProbe}
          disabled={saving || probing || !activeProvider || !activeInCurrentMode}
          className="px-4 py-2 rounded text-xs font-mono bg-primary/20 text-primary border border-primary/40 hover:bg-primary/30 transition-colors disabled:opacity-50"
        >
          {saving ? '保存中...' : probing ? '探测中...' : mode === 'local' ? '保存地址并探测本地模型' : '保存连接并探测模型'}
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
          {models.length === 0 && !probing ? (
            <input
              type="text"
              value={model}
              onChange={e => setModel(e.target.value)}
              placeholder="直接填写模型名（探测失败或中转无 /models 接口时）"
              className="w-full px-3 py-2 rounded bg-hover border border-border text-sm font-mono text-text focus:border-primary/40 focus:outline-none"
            />
          ) : (
            <select
              value={model}
              onChange={e => setModel(e.target.value)}
              disabled={models.length === 0 || probing || !activeInCurrentMode}
              className="w-full px-3 py-2 rounded bg-hover border border-border text-sm font-mono text-text focus:border-primary/40 focus:outline-none"
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
          )}
          {modelError && <p className="mt-1 text-xs text-red-400">{modelError}</p>}
        </div>
        <button
          type="button"
          onClick={saveSelectedModel}
          disabled={saving || !model || !activeInCurrentMode}
          className="px-4 py-2 rounded text-xs font-mono bg-primary/20 text-primary border border-primary/40 hover:bg-primary/30 transition-colors disabled:opacity-50"
        >
          {saving ? '保存中...' : '应用所选模型'}
        </button>
        {message && <span className="ml-3 text-xs text-primary">{message}</span>}
      </div>

      {pendingProvider ? (
        <ConfirmDialog
          title={mode === 'online' ? '切换在线推理后端' : '切换本地推理后端'}
          message={`是否将默认推理后端切换为“${pendingProvider.name}”？`}
          confirmLabel="切换"
          busy={saving}
          onCancel={() => {
            if (!saving) setPendingProvider(null)
          }}
          onConfirm={() => void selectProvider(pendingProvider.id)}
        />
      ) : null}

      {pendingImport ? (
        <ConfirmDialog
          title="导入本机模型代理"
          message={`是否将“${pendingImport.sourceLabel}”的代理配置（${pendingImport.baseUrl}）导入到 secbot 并切换为当前推理后端？完整 API Key 只在本机读取，不会发送到前端。`}
          confirmLabel="导入并使用"
          busy={saving}
          onCancel={() => {
            if (!saving) setPendingImport(null)
          }}
          onConfirm={() => void confirmImport()}
        />
      ) : null}
    </div>
  )
}
