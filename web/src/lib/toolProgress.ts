import type { ToolProgressSnapshot } from '@/lib/types'

const STATUSES: ToolProgressSnapshot['status'][] = [
  'running',
  'quiet',
  'possibly_stuck',
  'done',
  'failed',
  'timed_out',
]

export function progressStatusLabel(status: ToolProgressSnapshot['status']): string {
  if (status === 'quiet') return '暂无新输出'
  if (status === 'possibly_stuck') return '可能卡住'
  if (status === 'timed_out') return '已超时'
  if (status === 'failed') return '失败'
  if (status === 'done') return '完成'
  return '进行中'
}

export function normalizeToolProgress(data: Record<string, unknown>): ToolProgressSnapshot {
  const progress = Number(data.progress)
  const elapsedMs = Number(data.elapsed_ms)
  const lastOutputAgeMs = Number(data.last_output_age_ms)
  const statusRaw = String(data.status ?? 'running')
  const status = STATUSES.includes(statusRaw as ToolProgressSnapshot['status'])
    ? (statusRaw as ToolProgressSnapshot['status'])
    : 'running'
  return {
    status,
    phase: typeof data.phase === 'string' && data.phase ? data.phase : undefined,
    progress: Number.isFinite(progress) ? progress : undefined,
    elapsedMs: Number.isFinite(elapsedMs) ? elapsedMs : undefined,
    lastOutputAgeMs: Number.isFinite(lastOutputAgeMs) ? lastOutputAgeMs : undefined,
    message: typeof data.message === 'string' && data.message ? data.message : undefined,
    hint: typeof data.hint === 'string' && data.hint ? data.hint : undefined,
    command: typeof data.command === 'string' && data.command ? data.command : undefined,
    raw: typeof data.raw === 'string' && data.raw ? data.raw : undefined,
    receivedAt: Date.now(),
  }
}
