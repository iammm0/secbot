import { useEffect, useState } from 'react'
import {
  fetchExecGoSettings,
  probeExecGo,
  saveExecGoSettings,
  type ExecGoManagedProcess,
  type ExecGoSettings,
} from '@/lib/settingsApi'

export function ExecGoConfig() {
  const [settings, setSettings] = useState<ExecGoSettings | null>(null)
  const [siblingRoot, setSiblingRoot] = useState<string | null>(null)
  const [runtimeSiblingRoot, setRuntimeSiblingRoot] = useState<string | null>(null)
  const [cliPath, setCliPath] = useState('')
  const [serverBinary, setServerBinary] = useState<string | null>(null)
  const [runtimeBinary, setRuntimeBinary] = useState<string | null>(null)
  const [processes, setProcesses] = useState<ExecGoManagedProcess[]>([])
  const [healthy, setHealthy] = useState<boolean | null>(null)
  const [error, setError] = useState('')
  const [processErrors, setProcessErrors] = useState<string[]>([])
  const [message, setMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const [probing, setProbing] = useState(false)

  const applyProbe = (payload: Awaited<ReturnType<typeof fetchExecGoSettings>>) => {
    setSettings(payload.config)
    setSiblingRoot(payload.sibling_root)
    setRuntimeSiblingRoot(payload.runtime_sibling_root ?? null)
    setCliPath(payload.cli_path)
    setServerBinary(payload.server_binary ?? null)
    setRuntimeBinary(payload.runtime_binary ?? null)
    setProcesses(payload.processes ?? [])
    setHealthy(payload.healthy)
    if (payload.error) setError(payload.error)
  }

  const load = async () => {
    setProbing(true)
    setError('')
    try {
      applyProbe(await fetchExecGoSettings())
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败')
    } finally {
      setProbing(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const update = <K extends keyof ExecGoSettings>(key: K, value: ExecGoSettings[K]) => {
    setSettings((prev) => (prev ? { ...prev, [key]: value } : prev))
  }

  const save = async () => {
    if (!settings) return
    setSaving(true)
    setMessage('')
    setError('')
    setProcessErrors([])
    try {
      const saved = await saveExecGoSettings(settings)
      setSettings(saved.config)
      setProcesses(saved.processes)
      setProcessErrors(saved.process_errors)
      setMessage(
        saved.config.enabled
          ? '已启用 ExecGo，并尝试拉起本机后台进程'
          : '已关闭 ExecGo，并停止 Secbot 管理的后台进程',
      )
      const probe = await probeExecGo()
      applyProbe(probe)
      if (probe.error) setError(probe.error)
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  if (!settings) {
    return <div className="font-mono text-xs text-text-dim">{probing ? '探测 ExecGo…' : '加载中…'}</div>
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-mono text-lg text-text">ExecGo 运行时</h2>
        <p className="mt-1 text-sm text-text-dim">
          启用后自动拉起本机 `execgo` / `execgo-runtime` 后台进程；关闭后停止由 Secbot 管理的进程。
        </p>
      </div>

      <div className="rounded-xl border border-border bg-hover/40 p-4 font-mono text-xs text-text-dim space-y-1">
        <div>
          控制面：{' '}
          <span className={healthy ? 'text-primary' : 'text-warning'}>
            {healthy == null ? '未知' : healthy ? '健康' : '不可用'}
          </span>
        </div>
        <div className="truncate">CLI：{cliPath || settings.cliPath}</div>
        <div className="truncate">execgo 二进制：{serverBinary || '未找到'}</div>
        <div className="truncate">runtime 二进制：{runtimeBinary || '未找到（可选）'}</div>
        <div className="truncate">同级 execgo：{siblingRoot || '未检测到'}</div>
        <div className="truncate">同级 runtime：{runtimeSiblingRoot || '未检测到'}</div>
        {error ? <div className="text-warning">{error}</div> : null}
      </div>

      <div className="rounded-xl border border-border p-4 space-y-2">
        <div className="font-mono text-[11px] uppercase tracking-wider text-text-dim">本机后台进程</div>
        {processes.length === 0 ? (
          <div className="font-mono text-xs text-text-dim">尚无进程状态</div>
        ) : (
          processes.map((proc) => (
            <div key={proc.name} className="font-mono text-xs text-text-dim space-y-0.5">
              <div>
                <span className="text-text">{proc.name}</span>
                {' · '}
                <span className={proc.running ? 'text-primary' : 'text-warning'}>
                  {proc.running ? `运行中 pid=${proc.pid}` : '未运行'}
                </span>
                {proc.managed ? ' · Secbot 管理' : null}
              </div>
              <div className="truncate">addr {proc.addr}</div>
              <div className="truncate">bin {proc.binary || '—'}</div>
              <div className="truncate">log {proc.logFile}</div>
            </div>
          ))
        )}
        {processErrors.length > 0 ? (
          <div className="space-y-1 pt-1">
            {processErrors.map((item) => (
              <div key={item} className="font-mono text-xs text-warning">
                {item}
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <label className="flex items-start gap-3 rounded-xl border border-border p-4">
        <input
          type="checkbox"
          checked={settings.enabled}
          onChange={(e) => update('enabled', e.target.checked)}
          className="mt-1"
        />
        <span>
          <span className="block font-mono text-sm text-text">启用 ExecGo 模式（默认执行运行时）</span>
          <span className="mt-1 block text-xs text-text-dim">
            保存开启后会启动后台进程；保存关闭后会停止 Secbot 拉起的进程。
          </span>
        </span>
      </label>

      <label className="flex items-start gap-3 rounded-xl border border-border p-4">
        <input
          type="checkbox"
          checked={settings.auditActions}
          onChange={(e) => update('auditActions', e.target.checked)}
          className="mt-1"
        />
        <span>
          <span className="block font-mono text-sm text-text">审计每个 Secbot action</span>
          <span className="mt-1 block text-xs text-text-dim">
            每次工具调用前后向 ExecGo 提交 `os.noop` 审计事件（含工具名、参数摘要、耗时）。
          </span>
        </span>
      </label>

      <label className="flex items-start gap-3 rounded-xl border border-border p-4">
        <input
          type="checkbox"
          checked={settings.fallbackLocal}
          onChange={(e) => update('fallbackLocal', e.target.checked)}
          className="mt-1"
        />
        <span>
          <span className="block font-mono text-sm text-text">ExecGo 不可用时回退本地执行</span>
          <span className="mt-1 block text-xs text-text-dim">推荐开启，避免 CLI / 服务未启动时任务直接失败。</span>
        </span>
      </label>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1">
          <span className="font-mono text-[11px] uppercase tracking-wider text-text-dim">ExecGo URL</span>
          <input
            value={settings.url}
            onChange={(e) => update('url', e.target.value)}
            className="w-full rounded-lg border border-border bg-bg px-3 py-2 font-mono text-xs text-text outline-none focus:border-primary/40"
          />
        </label>
        <label className="block space-y-1">
          <span className="font-mono text-[11px] uppercase tracking-wider text-text-dim">Runtime URL</span>
          <input
            value={settings.runtimeUrl}
            onChange={(e) => update('runtimeUrl', e.target.value)}
            className="w-full rounded-lg border border-border bg-bg px-3 py-2 font-mono text-xs text-text outline-none focus:border-primary/40"
          />
        </label>
      </div>

      <label className="block space-y-1">
        <span className="font-mono text-[11px] uppercase tracking-wider text-text-dim">execgocli 路径</span>
        <input
          value={settings.cliPath}
          onChange={(e) => update('cliPath', e.target.value)}
          placeholder="../execgo/execgocli 或 PATH 中的 execgocli"
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
          onClick={() => void load()}
          className="rounded-lg border border-border px-4 py-2 font-mono text-xs text-text-dim hover:bg-hover hover:text-text disabled:opacity-50"
        >
          重新探测
        </button>
      </div>

      {message ? <div className="font-mono text-xs text-primary">{message}</div> : null}

      <div className="rounded-xl border border-border/80 p-4 text-xs text-text-dim space-y-2">
        <div className="font-mono text-[11px] uppercase tracking-wider">构建同级二进制</div>
        <pre className="overflow-x-auto rounded-lg bg-bg/60 p-3 font-mono text-[11px] text-text">
{`cd ../execgo
go build -o execgo ./cmd/execgo
go build -o execgocli ./cmd/execgocli

cd ../execgo-runtime
cargo build --release
# 产物：target/release/execgo-runtime → 默认 :18080`}
        </pre>
        <p>PID / 日志：`~/.secbot/run/`；数据目录：`~/.secbot/data/`。</p>
      </div>
    </div>
  )
}
