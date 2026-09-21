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

export function presentObservation(result: unknown, fallback = ''): { headline: string; excerpt: string } {
  const parsed = coerceStructured(result) ?? coerceStructured(fallback)
  const record = asRecord(parsed)
  if (record && (record.status != null || record.headers != null) && (record.body != null || record.status != null)) {
    const status = record.status != null ? String(record.status) : ''
    const statusText = typeof record.statusText === 'string' ? record.statusText : ''
    const headers = asRecord(record.headers)
    const contentType = headerValue(headers, 'content-type')
    const body = typeof record.body === 'string' ? record.body : ''
    const bits = [
      [status, statusText].filter(Boolean).join(' '),
      contentType ? contentType.split(';')[0].trim() : '',
      body ? formatSize(body.length) : '',
    ].filter(Boolean)
    return {
      headline: bits.join(' · ') || '已返回',
      excerpt: excerptText(body),
    }
  }

  if (record && typeof record.tool !== 'string') {
    const pretty = rawOutputText(record, '')
    const one = pretty.replace(/\s+/g, ' ').trim()
    return {
      headline: clip(one, 72),
      excerpt: excerptText(pretty),
    }
  }

  const text = peekableOutput(typeof result === 'string' ? result : fallback).replace(/^\*\*[^*]+\*\*\s*/gm, '').trim()
  const command = text.match(/`([^`]{1,120})`/)?.[1]
  const one = (command || text).replace(/\s+/g, ' ').trim()
  return {
    headline: clip(one, 72),
    excerpt: excerptText(text),
  }
}

/** Model traces often keep the raw `Thought:` / `Action: {…}` protocol in one string. */
export function presentThought(raw: string): string {
  const withoutLabel = raw.replace(/^\s*(?:\*\*)?Thought:(?:\*\*)?\s*/i, '')
  return stripActionCalls(withoutLabel).replace(/\n{3,}/g, '\n\n').trim()
}

function stripActionCalls(text: string): string {
  const marker = /(?:^|\s)(?:\*\*)?Action:(?:\*\*)?\s*/gi
  let result = ''
  let cursor = 0
  for (const match of text.matchAll(marker)) {
    const start = match.index ?? 0
    result += text.slice(cursor, start)
    let index = start + match[0].length
    while (index < text.length && /\s/.test(text[index])) index += 1
    if (text[index] === '{') {
      cursor = endOfJsonObject(text, index)
    } else {
      const newline = text.indexOf('\n', index)
      cursor = newline === -1 ? text.length : newline
    }
  }
  return result + text.slice(cursor)
}

function endOfJsonObject(text: string, start: number): number {
  let depth = 0
  let inString = false
  let escape = false
  for (let index = start; index < text.length; index += 1) {
    const char = text[index]
    if (inString) {
      if (escape) escape = false
      else if (char === '\\') escape = true
      else if (char === '"') inString = false
      continue
    }
    if (char === '"') {
      inString = true
      continue
    }
    if (char === '{') depth += 1
    else if (char === '}') {
      depth -= 1
      if (depth === 0) return index + 1
    }
  }
  return text.length
}

export function readActionCall(item: {
  tool?: string
  params?: Record<string, unknown>
  body?: string
}): { tool: string; arg: string } {
  let tool = item.tool?.trim() || ''
  let params = item.params
  const parsed = asRecord(coerceStructured(item.body))
  if (parsed) {
    if (!tool && typeof parsed.tool === 'string') tool = parsed.tool
    if (!params && parsed.params && typeof parsed.params === 'object' && !Array.isArray(parsed.params)) {
      params = parsed.params as Record<string, unknown>
    }
  }
  if (!tool || tool === 'action' || tool === '未知') tool = '工具'
  return { tool, arg: formatToolArg(params) }
}

function coerceStructured(value: unknown): unknown {
  if (typeof value !== 'string') return value && typeof value === 'object' ? value : null
  const text = value.trim()
  if (!text.startsWith('{') && !text.startsWith('[')) return null
  try {
    return JSON.parse(text) as unknown
  } catch {
    return null
  }
}

function clip(value: string, max: number): string {
  if (!value) return ''
  return value.length > max ? `${value.slice(0, max)}…` : value
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function headerValue(headers: Record<string, unknown> | null, name: string): string {
  if (!headers) return ''
  const found = Object.entries(headers).find(([key]) => key.toLowerCase() === name)
  return found ? String(found[1]) : ''
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function excerptText(value: string): string {
  const stripped = value
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim()
  if (!stripped) return ''
  const lines = stripped.split('\n').slice(0, 8).join('\n')
  return lines.length > 480 ? `${lines.slice(0, 480).trimEnd()}…` : lines
}

