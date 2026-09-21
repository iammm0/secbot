import { useCallback, useEffect, useState } from 'react'
import {
  clearAuditRecords,
  fetchAuditRecords,
  type AuditRecordView,
} from '@/lib/settingsApi'

const STEP_FILTERS = [
  { id: '', label: '全部' },
  { id: 'tool', label: '工具' },
  { id: 'llm', label: '模型' },
  { id: 'stage', label: '阶段' },
] as const

export function AuditConfig() {
  const [records, setRecords] = useState<AuditRecordView[]>([])
  const [total, setTotal] = useState(0)
  const [sessionId, setSessionId] = useState('')
  const [stepType, setStepType] = useState('')
  const [query, setQuery] = useState('')
  const [expanded, setExpanded] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const payload = await fetchAuditRecords({
        session_id: sessionId.trim() || undefined,
        step_type: stepType || undefined,
        q: query.trim() || undefined,
        limit: 100,
        offset: 0,
      })
      setRecords(payload.records)
      setTotal(payload.total)
    } catch (err) {
      setError(err instanceof Error ? err.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }, [sessionId, stepType, query])

  useEffect(() => {
    void load()
  }, [load])

  const clear = async (scoped: boolean) => {
    const target = scoped ? sessionId.trim() : ''
    if (scoped && !target) {
      setError('请先填写要清除的 session_id')
      return
    }
    const ok = window.confirm(
      scoped
        ? `清除会话 ${target} 的全部审计记录？`
        : `清除全部 ${total} 条审计记录？此操作不可恢复。`,
    )
    if (!ok) return
    setMessage('')
    setError('')
    try {
      const result = await clearAuditRecords(target || undefined)
      setMessage(`已删除 ${result.deleted} 条`)
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : '清除失败')
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="font-mono text-lg text-text">操作审计</h2>
        <p className="mt-1 text-sm text-text-dim">
          每个对话中的阶段、模型调用与工具执行都会落库，可按会话追溯。
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="min-w-[12rem] flex-1 space-y-1">
          <span className="font-mono text-[11px] uppercase tracking-wider text-text-dim">会话 ID</span>
          <input
            value={sessionId}
            onChange={(e) => setSessionId(e.target.value)}
            placeholder="留空 = 全部会话"
            className="w-full rounded-lg border border-border bg-bg px-3 py-2 font-mono text-xs text-text outline-none focus:border-primary/40"
          />
        </label>
        <label className="min-w-[12rem] flex-1 space-y-1">
          <span className="font-mono text-[11px] uppercase tracking-wider text-text-dim">关键词</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="工具名 / 内容 / session"
            className="w-full rounded-lg border border-border bg-bg px-3 py-2 font-mono text-xs text-text outline-none focus:border-primary/40"
          />
        </label>
        <button
          type="button"
          disabled={loading}
          onClick={() => void load()}
          className="rounded-lg border border-border px-4 py-2 font-mono text-xs text-text-dim hover:bg-hover hover:text-text disabled:opacity-50"
        >
          {loading ? '加载中…' : '刷新'}
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {STEP_FILTERS.map((item) => (
          <button
            key={item.id || 'all'}
            type="button"
            onClick={() => setStepType(item.id)}
            className={`rounded-lg px-3 py-1.5 font-mono text-xs transition-colors ${
              stepType === item.id
                ? 'bg-primary/15 text-primary'
                : 'border border-border text-text-dim hover:bg-hover hover:text-text'
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="font-mono text-xs text-text-dim">
        共 {total} 条 · 显示 {records.length} 条
      </div>

      <div className="space-y-2">
        {records.length === 0 ? (
          <div className="rounded-xl border border-border p-6 font-mono text-xs text-text-dim">
            暂无审计记录。发起一次对话后，工具与模型调用会出现在这里。
          </div>
        ) : (
          records.map((rec) => {
            const open = expanded === rec.id
            return (
              <button
                key={rec.id}
                type="button"
                onClick={() => setExpanded(open ? null : (rec.id ?? null))}
                className="block w-full rounded-xl border border-border bg-hover/30 p-3 text-left transition-colors hover:border-primary/30"
              >
                <div className="flex flex-wrap items-center gap-2 font-mono text-[11px] text-text-dim">
                  <span className={stepTone(rec.step_type)}>{rec.step_type}</span>
                  <span>{formatTime(rec.timestamp)}</span>
                  <span className="truncate">{rec.agent}</span>
                  <span className="truncate text-text/70">{rec.session_id}</span>
                </div>
                <div className="mt-1 font-mono text-xs text-text">{rec.content}</div>
                {open ? (
                  <pre className="mt-2 max-h-56 overflow-auto rounded-lg bg-bg/70 p-3 font-mono text-[11px] text-text-dim">
                    {JSON.stringify(rec.metadata, null, 2)}
                  </pre>
                ) : null}
              </button>
            )
          })
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => void clear(true)}
          className="rounded-lg border border-border px-4 py-2 font-mono text-xs text-text-dim hover:bg-hover hover:text-text"
        >
          清除当前会话
        </button>
        <button
          type="button"
          onClick={() => void clear(false)}
          className="rounded-lg border border-warning/40 px-4 py-2 font-mono text-xs text-warning hover:bg-warning/10"
        >
          清除全部
        </button>
      </div>

      {message ? <div className="font-mono text-xs text-primary">{message}</div> : null}
      {error ? <div className="font-mono text-xs text-warning">{error}</div> : null}
    </div>
  )
}

function stepTone(step: string): string {
  if (step === 'tool') return 'rounded bg-primary/15 px-1.5 py-0.5 text-primary'
  if (step === 'llm') return 'rounded bg-hover px-1.5 py-0.5 text-text'
  if (step === 'stage') return 'rounded bg-hover px-1.5 py-0.5 text-text-dim'
  return 'rounded bg-hover px-1.5 py-0.5'
}

function formatTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}
