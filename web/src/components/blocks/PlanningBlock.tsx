import type { StreamTimelineItem } from '@/lib/types'
import { MarkdownBody } from '@/components/MarkdownBody'
import { normalizePlanStatus } from '@/lib/planTodos'

interface Props { item: StreamTimelineItem }

const STATUS_LABEL: Record<string, string> = {
  pending: '待执行',
  in_progress: '进行中',
  completed: '完成',
  failed: '失败',
  timed_out: '超时',
  cancelled: '已取消',
  paused: '已暂停',
}

function rowTone(status: string): { box: string; text: string; label: string; mark: string } {
  if (status === 'completed') {
    return { box: 'border-primary bg-primary/15 text-primary', text: 'text-text-dim', label: 'text-primary', mark: '✓' }
  }
  if (status === 'in_progress') {
    return { box: 'border-accent bg-accent/15 text-accent', text: 'text-text', label: 'text-accent', mark: '' }
  }
  if (status === 'failed') {
    return { box: 'border-error bg-error/10 text-error', text: 'text-error', label: 'text-error', mark: '×' }
  }
  if (status === 'timed_out') {
    return { box: 'border-warning bg-warning/10 text-warning', text: 'text-warning', label: 'text-warning', mark: '!' }
  }
  if (status === 'cancelled') {
    return { box: 'border-border bg-hover text-text-dim', text: 'text-text-dim line-through', label: 'text-text-dim', mark: '–' }
  }
  if (status === 'paused') {
    return { box: 'border-warning bg-warning/10 text-warning', text: 'text-text', label: 'text-warning', mark: 'Ⅱ' }
  }
  return { box: 'border-border bg-transparent text-transparent', text: 'text-text', label: 'text-text-dim', mark: '' }
}

export function PlanningBlock({ item }: Props) {
  const todos = (item.todos ?? []).map((todo) => ({
    ...todo,
    status: normalizePlanStatus(todo.status),
  }))
  const total = todos.length
  const completed = todos.filter((todo) => todo.status === 'completed').length
  const failed = todos.filter((todo) => todo.status === 'failed' || todo.status === 'cancelled').length
  const timedOut = todos.filter((todo) => todo.status === 'timed_out').length
  const active = todos.filter((todo) => todo.status === 'in_progress').length
  const paused = todos.filter((todo) => todo.status === 'paused').length
  const finished = completed + failed + timedOut
  const ratio = total > 0 ? Math.round((finished / total) * 100) : 0
  const headline = [
    `${completed}/${total || 0}`,
    active ? '进行中' : '',
    failed ? `${failed} 失败` : '',
    timedOut ? `${timedOut} 超时` : '',
    paused ? '已暂停' : '',
    !active && !failed && !timedOut && !paused && total > 0 && completed === total ? '已完成' : '',
  ].filter(Boolean).join(' · ')

  return (
    <div className="glass-card animate-fade-in-up px-4 py-3">
      <div className="mb-3 flex items-center gap-2">
        <span className="text-xs font-semibold uppercase tracking-wider text-accent">{item.title || '规划'}</span>
        {item.planScope === 'adaptive' ? (
          <span className="rounded bg-warning/10 px-1.5 py-0.5 font-mono text-[10px] text-warning">穿插</span>
        ) : null}
        {total > 0 ? <span className="ml-auto font-mono text-[11px] text-text-dim">{headline}</span> : null}
      </div>
      {total > 0 ? (
        <div className="mb-3 h-1 overflow-hidden rounded-full bg-border/80">
          <div
            className={`h-full rounded-full transition-[width] duration-300 ${failed || timedOut ? 'bg-warning' : 'bg-primary'}`}
            style={{ width: `${ratio}%` }}
          />
        </div>
      ) : null}
      {todos.length > 0 ? (
        <ul className="space-y-1">
          {todos.map((todo, index) => {
            const tone = rowTone(todo.status)
            return (
              <li
                key={todo.id || `${index}-${todo.content}`}
                className={`flex items-start gap-2.5 rounded-md px-1.5 py-1 ${todo.status === 'in_progress' ? 'bg-accent/5' : ''}`}
              >
                <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border font-mono text-[10px] leading-none ${tone.box} ${todo.status === 'in_progress' ? 'animate-pulse' : ''}`}>
                  {tone.mark}
                </span>
                <span className={`min-w-0 flex-1 font-mono text-[13px] leading-5 ${tone.text}`}>{todo.content}</span>
                <span className={`shrink-0 pt-0.5 font-mono text-[10px] ${tone.label}`}>{STATUS_LABEL[todo.status] ?? '待执行'}</span>
              </li>
            )
          })}
        </ul>
      ) : null}
      {item.body && !todos.length ? <MarkdownBody className="md-compact">{item.body}</MarkdownBody> : null}
    </div>
  )
}
