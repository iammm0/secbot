const PREFERRED_PARAM_KEYS = [
  'command',
  'url',
  'query',
  'path',
  'file',
  'target',
  'cve',
  'cve_id',
  'host',
  'ip',
] as const

export const COLLAPSED_PREVIEW_LINES = 3
export const COLLAPSED_PREVIEW_CHARS = 280

export function formatToolArg(params?: Record<string, unknown>): string {
  if (!params) return ''
  for (const key of PREFERRED_PARAM_KEYS) {
    const value = params[key]
    if (typeof value === 'string' && value.trim()) {
      const one = value.trim().replace(/\s+/g, ' ')
      return one.length > 80 ? `${one.slice(0, 80)}…` : one
    }
  }
  try {
    const json = JSON.stringify(params)
    if (!json || json === '{}') return ''
    return json.length > 80 ? `${json.slice(0, 80)}…` : json
  } catch {
    return ''
  }
}

export function rawOutputText(result: unknown, fallback = ''): string {
  if (result && typeof result === 'object' && !Array.isArray(result)) {
    const obj = result as Record<string, unknown>
    const stdout = typeof obj.stdout === 'string' ? obj.stdout : ''
    const stderr = typeof obj.stderr === 'string' ? obj.stderr : ''
    const output = typeof obj.output === 'string' ? obj.output : ''
    const merged = [stdout, stderr, output].filter(Boolean).join('\n').trim()
    if (merged) return merged
  }
  if (typeof result === 'string') return result
  if (result != null) {
    try {
      return JSON.stringify(result, null, 2)
    } catch {
      return String(result)
    }
  }
  return fallback
}

export function peekableOutput(text: string): string {
  const fence = text.match(/```(?:\w+)?\n([\s\S]*?)```/)
  if (fence?.[1]?.trim()) return fence[1].trim()
  return text
    .replace(/^\*\*[^*]+\*\*\s*/gm, '')
    .replace(/^`([^`]+)`\s*$/gm, '$1')
    .trim()
}

export function foldText(
  text: string,
  maxLines = COLLAPSED_PREVIEW_LINES,
  maxChars = COLLAPSED_PREVIEW_CHARS,
): { preview: string; hiddenLines: number; totalLines: number; truncated: boolean } {
  const normalized = text.replace(/\r\n/g, '\n').replace(/^\s+|\s+$/g, '')
  if (!normalized) {
    return { preview: '', hiddenLines: 0, totalLines: 0, truncated: false }
  }
  const lines = normalized.split('\n')
  const totalLines = lines.length
  const usedLines = Math.min(maxLines, totalLines)
  let preview = lines.slice(0, usedLines).join('\n')
  if (preview.length > maxChars) {
    preview = `${preview.slice(0, maxChars).trimEnd()}…`
  }
  const hiddenLines = Math.max(0, totalLines - usedLines)
  return {
    preview,
    hiddenLines,
    totalLines,
    truncated: hiddenLines > 0 || normalized.length > maxChars,
  }
}
