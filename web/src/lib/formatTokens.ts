export function formatTokenCount(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0'
  if (n < 1_000) return String(Math.round(n))
  if (n < 10_000) return `${(n / 1_000).toFixed(1)}K`
  if (n < 1_000_000) return `${(n / 1_000).toFixed(1)}K`
  return `${(n / 1_000_000).toFixed(1)}M`
}

export function parseContextUsageParts(raw: unknown): Array<{ id: string; label: string; tokens: number }> {
  if (!Array.isArray(raw)) return []
  const parts: Array<{ id: string; label: string; tokens: number }> = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const rec = item as Record<string, unknown>
    const tokens = Number(rec.tokens ?? 0)
    if (!Number.isFinite(tokens) || tokens <= 0) continue
    const id = typeof rec.id === 'string' && rec.id ? rec.id : 'other'
    const label = typeof rec.label === 'string' && rec.label ? rec.label : id
    parts.push({ id, label, tokens: Math.round(tokens) })
  }
  return parts
}
