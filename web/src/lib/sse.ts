import { API_BASE_URL, CONNECTION_TIMEOUT_MS, READ_STALL_TIMEOUT_MS } from './constants'
import type { SSEEvent } from './types'

export interface SSECallbacks {
  onEvent: (event: SSEEvent) => void
  onError?: (error: Error) => void
  onDone?: () => void
}

function parseSSESegment(segment: string): { event: string; data: string } | null {
  const lines = segment.split('\n')
  let event = 'message'
  const dataLines: string[] = []
  for (const line of lines) {
    if (line.startsWith('event:')) event = line.slice(6).trim()
    else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim())
  }
  if (dataLines.length === 0) return null
  return { event, data: dataLines.join('\n') }
}

export function connectSSE(
  path: string,
  body: Record<string, unknown>,
  callbacks: SSECallbacks,
): AbortController {
  const controller = new AbortController()
  const url = `${API_BASE_URL}${path}`
  let connectionTimeoutId: ReturnType<typeof setTimeout> | null = null
  let readStallId: ReturnType<typeof setTimeout> | null = null

  const clearConnectionTimeout = () => { if (connectionTimeoutId != null) { clearTimeout(connectionTimeoutId); connectionTimeoutId = null } }
  const clearReadStall = () => { if (readStallId != null) { clearTimeout(readStallId); readStallId = null } }

  ;(async () => {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      })

      if (!response.ok) {
        const text = await response.text()
        throw new Error(`SSE HTTP ${response.status}: ${text.slice(0, 200)}`)
      }

      const reader = response.body?.getReader()
      let hasDoneEvent = false

      const emitParsedEvent = (eventName: string, rawData: string) => {
        try {
          const parsedData = JSON.parse(rawData) as Record<string, unknown>
          callbacks.onEvent({ event: eventName, data: parsedData })
        } catch {
          callbacks.onEvent({ event: eventName, data: { raw: rawData } })
        }
        if (eventName === 'done' && !hasDoneEvent) {
          hasDoneEvent = true
          callbacks.onDone?.()
        }
      }

      if (reader) {
        const decoder = new TextDecoder()
        let buffer = ''
        let hasReceivedEvent = false

        const resetReadStall = () => {
          clearReadStall()
          readStallId = setTimeout(() => {
            controller.abort()
            callbacks.onError?.(new Error('Read timeout: server unresponsive'))
          }, READ_STALL_TIMEOUT_MS)
        }

        connectionTimeoutId = setTimeout(() => {
          if (hasReceivedEvent) return
          controller.abort()
          callbacks.onError?.(new Error('Connection timeout — is the backend running?'))
        }, CONNECTION_TIMEOUT_MS)

        while (true) {
          const { done, value } = await reader.read()
          if (done) break
          resetReadStall()
          buffer += decoder.decode(value, { stream: true })
          const normalized = buffer.replace(/\r\n/g, '\n')
          const parts = normalized.split('\n\n')
          buffer = parts.pop() ?? ''
          for (const segment of parts) {
            const parsed = parseSSESegment(segment)
            if (!parsed) continue
            hasReceivedEvent = true
            clearConnectionTimeout()
            emitParsedEvent(parsed.event, parsed.data)
          }
        }
        clearReadStall()
        if (buffer.trim()) {
          const parsed = parseSSESegment(buffer)
          if (parsed) emitParsedEvent(parsed.event, parsed.data)
        }
        clearConnectionTimeout()
        if (!hasDoneEvent) callbacks.onDone?.()
      }
    } catch (err: unknown) {
      clearConnectionTimeout()
      clearReadStall()
      if (err instanceof Error && err.name !== 'AbortError') {
        callbacks.onError?.(err)
      }
    }
  })()

  return controller
}
