import { useEffect, useState } from 'react'
import {
  fetchJevSettings,
  probeJev,
  saveJevSettings,
  type JevPublicConfig,
} from '@/lib/settingsApi'

const STAGES: Array<{ key: keyof Pick<JevPublicConfig, 'intent' | 'qaLive' | 'adaptive' | 'reactStop' | 'context'>; label: string; hint: string }> = [
  { key: 'intent', label: '意图分类', hint: 'IntentRouter：6 类意图 + 是否探索/出报告' },
  { key: 'qaLive', label: 'QA 实时检索', hint: '判断是不是在问最新漏洞或当前态势' },
  { key: 'adaptive', label: '自适应重规划', hint: '失败子任务是否值得再打一轮 Planner' },
  { key: 'reactStop', label: 'ReAct 停机', hint: '观察回来后是否可以收束；阈值更高' },
  { key: 'context', label: '上下文裁剪', hint: '只过滤向量/SQLite 命中，不碰 pinned 与近轮对话' },
]

export function JevConfig() {
  const [settings, setSettings] = useState<JevPublicConfig | null>(null)
  const [apiKey, setApiKey] = useState('')
  const [healthy, setHealthy] = useState<boolean | null>(null)
  const [noul, setNoul] = useState<number | undefined>()
  const [modelResolved, setModelResolved] = useState<string | undefined>()
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const [probing, setProbing] = useState(false)

  const load = async () => {
    setProbing(true)
    setError('')
    try {
      const payload = await fetchJevSettings()
      setSettings(payload.config)
      setHealthy(payload.healthy ?? null)
      setNoul(payload.noul)
      setModelResolved(payload.model)
      if (payload.error) setError(payload.error)
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败')
    } finally {
      setProbing(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const update = <K extends keyof JevPublicConfig>(key: K, value: JevPublicConfig[K]) => {
    setSettings((prev) => (prev ? { ...prev, [key]: value } : prev))
  }

  const save = async () => {
    if (!settings) return
    setSaving(true)
    setMessage('')
    setError('')
    try {
      const saved = await saveJevSettings({
        ...settings,
        apiKey: apiKey.trim() || undefined,
      })
      setSettings(saved.config)
      setApiKey('')
      setMessage(saved.config.enabled ? '已保存 Jev 配置。主开关打开后才会走判断层。' : '已保存。Jev 主开关关闭，流程仍走原来的 LLM/启发式。')
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const runProbe = async () => {
    setProbing(true)
    setError('')
    setMessage('')
    try {
      const payload = await probeJev()
      setSettings(payload.config)
      setHealthy(payload.healthy ?? null)
      setNoul(payload.noul)
      setModelResolved(payload.model)
      if (payload.error) setError(payload.error)
      else setMessage(`探测成功${payload.noul != null ? `，urgency noul=${payload.noul.toFixed(3)}` : ''}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : '探测失败')
    } finally {
      setProbing(false)
    }
  }

  if (!settings) {
    return <div className="font-mono text-xs text-text-dim">{probing ? '加载 Jev…' : '加载中…'}</div>
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-mono text-lg text-text">Jev 判断层</h2>
        <p className="mt-1 text-sm text-text-dim">
          TypeSafe System One：只做 Choice / Score / 是非判断，不生成文字。默认全关；打开后高置信才采纳，失败则退回原来的 LLM 或启发式。
          Jev 不会绕过敏感工具审批。
        </p>
      </div>

      <div className="rounded-xl border border-border bg-hover/40 p-4 font-mono text-xs text-text-dim space-y-1">
        <div>
          探测：{' '}
          <span className={healthy ? 'text-primary' : 'text-warning'}>
            {healthy == null ? '未探测' : healthy ? '可用' : '不可用'}
          </span>
          {modelResolved ? ` · ${modelResolved}` : null}
        </div>
        <div>API Key：{settings.hasApiKey ? '已配置' : '未配置'}</div>
        {noul != null ? <div>上次 probe noul：{noul.toFixed(3)}</div> : null}
        {error ? <div className="text-warning">{error}</div> : null}
      </div>

      <label className="flex items-start gap-3 rounded-xl border border-border p-4">
        <input
          type="checkbox"
          checked={settings.enabled}
          onChange={(e) => update('enabled', e.target.checked)}
          className="mt-1"
        />
        <span>
          <span className="block font-mono text-sm text-text">启用 Jev 主开关</span>
          <span className="mt-1 block text-xs text-text-dim">
            关闭时五个环节全部走原逻辑。打开后仍需单独勾选环节，并填好 API Key。
          </span>
        </span>
      </label>

      {STAGES.map((stage) => (
        <label key={stage.key} className="flex items-start gap-3 rounded-xl border border-border p-4">
          <input
            type="checkbox"
            checked={settings[stage.key]}
            onChange={(e) => update(stage.key, e.target.checked)}
            className="mt-1"
          />
          <span>
            <span className="block font-mono text-sm text-text">{stage.label}</span>
            <span className="mt-1 block text-xs text-text-dim">{stage.hint}</span>
          </span>
        </label>
      ))}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1">
          <span className="font-mono text-[11px] uppercase tracking-wider text-text-dim">Model</span>
          <input
            value={settings.model}
            onChange={(e) => update('model', e.target.value)}
            placeholder="jev-latest"
            className="w-full rounded-lg border border-border bg-bg px-3 py-2 font-mono text-xs text-text outline-none focus:border-primary/40"
          />
        </label>
        <label className="block space-y-1">
          <span className="font-mono text-[11px] uppercase tracking-wider text-text-dim">Base URL</span>
          <input
            value={settings.baseUrl}
            onChange={(e) => update('baseUrl', e.target.value)}
            placeholder="https://api.typesafe.ai"
            className="w-full rounded-lg border border-border bg-bg px-3 py-2 font-mono text-xs text-text outline-none focus:border-primary/40"
          />
        </label>
        <label className="block space-y-1">
          <span className="font-mono text-[11px] uppercase tracking-wider text-text-dim">置信度阈值</span>
          <input
            type="number"
            min={0}
            max={1}
            step={0.01}
            value={settings.confidenceMin}
            onChange={(e) => update('confidenceMin', Number(e.target.value))}
            className="w-full rounded-lg border border-border bg-bg px-3 py-2 font-mono text-xs text-text outline-none focus:border-primary/40"
          />
        </label>
        <label className="block space-y-1">
          <span className="font-mono text-[11px] uppercase tracking-wider text-text-dim">ReAct 停机阈值</span>
          <input
            type="number"
            min={0}
            max={1}
            step={0.01}
            value={settings.reactStopMin}
            onChange={(e) => update('reactStopMin', Number(e.target.value))}
            className="w-full rounded-lg border border-border bg-bg px-3 py-2 font-mono text-xs text-text outline-none focus:border-primary/40"
          />
        </label>
      </div>

      <label className="block space-y-1">
        <span className="font-mono text-[11px] uppercase tracking-wider text-text-dim">TypeSafe API Key</span>
        <input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
          placeholder={settings.hasApiKey ? '已保存，留空则不改' : 'TYPESAFE_API_KEY'}
          className="w-full rounded-lg border border-border bg-bg px-3 py-2 font-mono text-xs text-text outline-none focus:border-primary/40"
        />
      </label>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={saving}
          onClick={() => void save()}
          className="rounded-lg bg-primary px-4 py-2 font-mono text-xs text-bg hover:brightness-110 disabled:opacity-50"
        >
          {saving ? '保存中…' : '保存'}
        </button>
        <button
          type="button"
          disabled={probing}
          onClick={() => void runProbe()}
          className="rounded-lg border border-border px-4 py-2 font-mono text-xs text-text-dim hover:bg-hover hover:text-text disabled:opacity-50"
        >
          {probing ? '探测中…' : '探测'}
        </button>
      </div>

      {message ? <div className="font-mono text-xs text-primary">{message}</div> : null}
    </div>
  )
}
