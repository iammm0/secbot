import type { StreamTimelineItem } from '@/lib/types'

interface Props { item: StreamTimelineItem }

export function PlanningBlock({ item }: Props) {
  return (
    <div className="glass-card p-4 animate-fade-in-up">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-accent text-xs font-semibold uppercase tracking-wider">{item.title}</span>
        {item.planScope === 'adaptive' && <span className="text-xs text-warning bg-warning/10 px-2 py-0.5 rounded">adaptive</span>}
      </div>
      {item.todos && item.todos.length > 0 && (
        <ul className="space-y-1.5">
          {item.todos.map((todo, i) => (
            <li key={i} className="flex items-center gap-2 text-sm font-mono">
              <span className={`w-4 h-4 rounded border flex items-center justify-center text-xs ${
                todo.status === 'done' ? 'border-primary bg-primary/20 text-primary' :
                todo.status === 'cancelled' ? 'border-error bg-error/10 text-error' :
                'border-white/20'
              }`}>
                {todo.status === 'done' ? '✓' : todo.status === 'cancelled' ? '×' : ''}
              </span>
              <span className={todo.status === 'done' ? 'text-text-dim line-through' : 'text-text'}>{todo.content}</span>
            </li>
          ))}
        </ul>
      )}
      {item.body && !item.todos?.length && <p className="text-sm text-text-dim font-mono">{item.body}</p>}
    </div>
  )
}
