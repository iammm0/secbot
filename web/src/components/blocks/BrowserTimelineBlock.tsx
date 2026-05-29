import type { StreamTimelineItem } from '@/lib/types'

interface Props { item: StreamTimelineItem }

export function BrowserTimelineBlock({ item }: Props) {
  const steps = item.browserSteps ?? []

  return (
    <div className="glass-card p-4 animate-fade-in-up">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-secondary text-xs font-semibold uppercase tracking-wider">{item.title || 'ExploreAgent · 浏览路径'}</span>
        {item.focus?.map((f) => (
          <span key={f} className="text-xs bg-secondary/10 text-secondary px-2 py-0.5 rounded">{f}</span>
        ))}
      </div>
      <div className="space-y-1 ml-2 border-l border-white/10 pl-3">
        {steps.map((step, i) => (
          <div key={i} className="flex flex-col gap-0.5 text-xs font-mono">
            <div className="flex items-center gap-2">
              <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                step.kind === 'end' ? 'bg-primary' :
                step.ok === false ? 'bg-error' :
                step.kind === 'action_start' ? 'bg-warning' : 'bg-white/30'
              }`} />
              <span className="text-text-dim">{step.tool ?? step.kind}</span>
              {step.target && <span className="text-text truncate max-w-[300px]">{step.target}</span>}
            </div>
            {step.detail && (
              <div className="ml-4 text-text-dim/70 truncate max-w-[500px]">{step.detail}</div>
            )}
          </div>
        ))}
      </div>
      {item.exploreSummary && (
        <div className="mt-2 text-xs text-text-dim">
          已补充 {item.exploreSummary.factsCount} 条事实
          {item.exploreSummary.summary && <span> · {item.exploreSummary.summary}</span>}
        </div>
      )}
    </div>
  )
}
