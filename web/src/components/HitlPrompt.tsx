import { useMemo, useState } from 'react'
import type { HitlConfirmRequest, HitlUserInputRequest } from '@/lib/types'

type Props =
  | {
      kind: 'confirm'
      request: HitlConfirmRequest
      busy?: boolean
      onRespond: (action: 'allow' | 'deny' | 'always_allow') => void
    }
  | {
      kind: 'user_input'
      request: HitlUserInputRequest
      busy?: boolean
      onRespond: (payload: { selected: string[]; text: string }) => void
    }

export function HitlPrompt(props: Props) {
  if (props.kind === 'confirm') {
    return <ConfirmCard request={props.request} busy={props.busy} onRespond={props.onRespond} />
  }
  return <DecisionCard request={props.request} busy={props.busy} onRespond={props.onRespond} />
}

function ConfirmCard({
  request,
  busy,
  onRespond,
}: {
  request: HitlConfirmRequest
  busy?: boolean
  onRespond: (action: 'allow' | 'deny' | 'always_allow') => void
}) {
  const paramsPreview = useMemo(() => {
    try {
      return JSON.stringify(request.params ?? {}, null, 2)
    } catch {
      return String(request.params ?? '')
    }
  }, [request.params])

  return (
    <div className="mb-2 overflow-hidden rounded-xl border border-warning/40 bg-warning/5 shadow-lg animate-fade-in-up">
      <div className="border-b border-warning/20 px-3 py-2 font-mono text-[11px] uppercase tracking-wider text-warning">
        敏感操作批准 · Hack 模式
      </div>
      <div className="space-y-2 px-3 py-3">
        <div className="font-mono text-sm text-text">
          请求执行 <span className="text-warning">{request.tool}</span>
        </div>
        {request.risk_summary ? (
          <p className="text-xs text-text-dim">{request.risk_summary}</p>
        ) : null}
        <pre className="max-h-28 overflow-auto rounded-lg border border-border bg-bg/60 p-2 font-mono text-[10px] text-text-dim">
          {paramsPreview}
        </pre>
        <div className="flex flex-wrap gap-2 pt-1">
          <button
            type="button"
            disabled={busy}
            onClick={() => onRespond('allow')}
            className="rounded-lg bg-primary px-3 py-1.5 font-mono text-xs text-bg hover:brightness-110 disabled:opacity-50"
          >
            批准一次
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onRespond('always_allow')}
            className="rounded-lg border border-primary/40 bg-primary/10 px-3 py-1.5 font-mono text-xs text-primary hover:bg-primary/20 disabled:opacity-50"
          >
            本会话始终允许
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => onRespond('deny')}
            className="rounded-lg border border-border px-3 py-1.5 font-mono text-xs text-text-dim hover:bg-hover hover:text-text disabled:opacity-50"
          >
            拒绝
          </button>
        </div>
      </div>
    </div>
  )
}

function DecisionCard({
  request,
  busy,
  onRespond,
}: {
  request: HitlUserInputRequest
  busy?: boolean
  onRespond: (payload: { selected: string[]; text: string }) => void
}) {
  const multi = request.input_type === 'multi_select'
  const textOnly = request.input_type === 'text'
  const [selected, setSelected] = useState<string[]>([])
  const [text, setText] = useState('')

  const toggle = (id: string) => {
    setSelected((prev) => {
      if (multi) {
        return prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
      }
      return prev[0] === id ? [] : [id]
    })
  }

  const canSubmit = textOnly
    ? text.trim().length > 0
    : selected.length > 0 || (request.allow_free_text && text.trim().length > 0)

  return (
    <div className="mb-2 overflow-hidden rounded-xl border border-primary/35 bg-primary/5 shadow-lg animate-fade-in-up">
      <div className="border-b border-primary/20 px-3 py-2 font-mono text-[11px] uppercase tracking-wider text-primary">
        需要你的决策
      </div>
      <div className="space-y-3 px-3 py-3">
        <p className="text-sm text-text">{request.prompt}</p>
        {!textOnly && request.options.length > 0 ? (
          <div className="space-y-1.5">
            {request.options.map((opt) => {
              const active = selected.includes(opt.id)
              return (
                <button
                  key={opt.id}
                  type="button"
                  disabled={busy}
                  onClick={() => toggle(opt.id)}
                  className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left font-mono text-xs transition-colors ${
                    active
                      ? 'border-primary/50 bg-primary/15 text-primary'
                      : 'border-border text-text-dim hover:border-primary/30 hover:text-text'
                  }`}
                >
                  <span
                    className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center border ${
                      multi ? 'rounded-sm' : 'rounded-full'
                    } ${active ? 'border-primary bg-primary' : 'border-border'}`}
                  />
                  <span className="min-w-0 flex-1">{opt.label}</span>
                </button>
              )
            })}
          </div>
        ) : null}
        {(textOnly || request.allow_free_text) && (
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={busy}
            rows={2}
            placeholder={textOnly ? '请描述你的决定…' : '可选：补充说明…'}
            className="w-full resize-none rounded-lg border border-border bg-bg/60 px-3 py-2 font-mono text-xs text-text outline-none placeholder:text-text-dim focus:border-primary/40"
          />
        )}
        <button
          type="button"
          disabled={busy || !canSubmit}
          onClick={() => onRespond({ selected, text: text.trim() })}
          className="rounded-lg bg-primary px-3 py-1.5 font-mono text-xs text-bg hover:brightness-110 disabled:opacity-50"
        >
          确认并继续
        </button>
      </div>
    </div>
  )
}
