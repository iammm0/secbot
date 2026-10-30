import { formatElapsed } from '@/lib/formatElapsed'

interface Props {
  phase?: string
  detail?: string
  elapsedMs?: number
}

/**
 * 任务进行中的状态行：不再使用窗口顶部边框的滑动加载动画，
 * 改由任务流区域里的闪烁「推理中…」文字表示工作流持续进行。
 * 这里只保留精简的阶段与耗时信息。
 */
export function LoadingBar({ phase, detail, elapsedMs = 0 }: Props) {
  if (!phase && !detail && elapsedMs <= 0) return null
  return (
    <div className="flex min-h-6 items-center gap-2 px-4 py-1 font-mono text-xs text-text-dim">
      <span className="truncate">
        {phase}
        {detail ? ` · ${detail}` : ''}
      </span>
      {elapsedMs > 0 ? (
        <span className="ml-auto shrink-0 tabular-nums text-warning">{formatElapsed(elapsedMs)}</span>
      ) : null}
    </div>
  )
}
