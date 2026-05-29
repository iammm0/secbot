import { useState, useCallback, useRef, useEffect } from 'react'
import { connectSSE } from '@/lib/sse'
import { TYPEWRITER_CHARS_PER_TICK, TYPEWRITER_INTERVAL_MS } from '@/lib/constants'
import { TRANSIENT_TOOLS } from '@/lib/streamConstants'
import { buildObservationBody } from '@/lib/toolObservation'
import type { ChatMode, SSEEvent, StreamState, StreamTimelineItem, BrowserStep, HistoryItem } from '@/lib/types'

const initialStreamState: StreamState = {
  phase: '', detail: '', planning: null, thought: null,
  thoughtChunks: new Map(), actions: [], content: '', report: '',
  error: null, response: null, timeline: [], contextUsage: null,
}

function resetStreamState(prev?: StreamState | null): StreamState {
  return { ...initialStreamState, thoughtChunks: new Map(), actions: [], timeline: [], contextUsage: prev?.contextUsage ?? null }
}

const HISTORY_PREFIX = 'secbot-history-'

function loadHistory(sessionId: string): HistoryItem[] {
  try {
    const raw = localStorage.getItem(HISTORY_PREFIX + sessionId)
    if (!raw) return []
    const items: HistoryItem[] = JSON.parse(raw)
    // Restore Map fields that JSON.stringify drops
    for (const item of items) {
      if (item.streamState) item.streamState.thoughtChunks = new Map()
    }
    return items
  } catch { return [] }
}

function saveHistory(sessionId: string, history: HistoryItem[]) {
  try {
    // Replace Map with empty object for serialization
    const serializable = history.map(h => ({
      ...h,
      streamState: { ...h.streamState, thoughtChunks: {} },
    }))
    localStorage.setItem(HISTORY_PREFIX + sessionId, JSON.stringify(serializable))
  } catch { /* quota exceeded — ignore */ }
}

export function useChat(sessionId: string) {
  const [streaming, setStreaming] = useState(false)
  const [streamState, setStreamState] = useState<StreamState>(initialStreamState)
  const [history, setHistory] = useState<HistoryItem[]>(() => loadHistory(sessionId))

  const abortRef = useRef<AbortController | null>(null)
  const streamStateRef = useRef<StreamState>(initialStreamState)
  const currentUserMessageRef = useRef('')
  const currentSentAtRef = useRef(0)
  const completedAtRef = useRef(0)
  const typewriterRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const receivedChunksRef = useRef(false)
  const thoughtSeqRef = useRef(0)
  const activeThoughtIdByStepRef = useRef<Map<string, string>>(new Map())
  const currentBrowserTraceIdRef = useRef<string | null>(null)
  const browserStepCounterRef = useRef(0)

  useEffect(() => { streamStateRef.current = streamState }, [streamState])

  // Persist history to localStorage
  useEffect(() => { saveHistory(sessionId, history) }, [sessionId, history])

  const upsertTimelineItem = useCallback(
    (timeline: StreamTimelineItem[], id: string, build: (prev?: StreamTimelineItem) => StreamTimelineItem) => {
      const idx = timeline.findIndex((item) => item.id === id)
      if (idx === -1) return [...timeline, build(undefined)]
      const next = [...timeline]
      next[idx] = build(next[idx])
      return next
    }, [],
  )

  const appendContent = useCallback((text: string) => {
    setStreamState((s) => ({
      ...s,
      content: s.content ? `${s.content}\n\n${text}` : text,
    }))
  }, [])

  const clearTypewriter = useCallback(() => {
    if (typewriterRef.current !== null) { clearInterval(typewriterRef.current); typewriterRef.current = null }
  }, [])

  const startTypewriter = useCallback((fullText: string) => {
    clearTypewriter()
    let revealed = 0
    typewriterRef.current = setInterval(() => {
      revealed += TYPEWRITER_CHARS_PER_TICK
      const chunk = fullText.slice(0, revealed)
      setStreamState((s) => ({
        ...s,
        response: chunk,
        timeline: upsertTimelineItem(s.timeline, 'final-summary', (prev) =>
          prev ? { ...prev, body: chunk } : { id: 'final-summary', type: 'final', title: '最终总结', body: chunk, status: 'running' },
        ),
      }))
      if (revealed >= fullText.length) {
        clearTypewriter()
        setStreamState((s) => ({
          ...s,
          response: fullText,
          timeline: upsertTimelineItem(s.timeline, 'final-summary', (prev) =>
            prev ? { ...prev, body: fullText, status: 'done' } : { id: 'final-summary', type: 'final', title: '最终总结', body: fullText, status: 'done' },
          ),
        }))
      }
    }, TYPEWRITER_INTERVAL_MS)
  }, [clearTypewriter, upsertTimelineItem])

  const sendMessage = useCallback((message: string, mode: ChatMode = 'agent') => {
    abortRef.current?.abort()
    clearTypewriter()

    currentUserMessageRef.current = message
    currentSentAtRef.current = Date.now()
    completedAtRef.current = 0
    thoughtSeqRef.current = 0
    activeThoughtIdByStepRef.current = new Map()
    receivedChunksRef.current = false
    currentBrowserTraceIdRef.current = null
    browserStepCounterRef.current = 0

    setStreamState({ ...resetStreamState(streamStateRef.current), currentUserMessage: message })
    setStreaming(true)

    const controller = connectSSE('/api/chat', { message, session_id: sessionId, mode, agent: 'secbot-cli' }, {
      onEvent(ev: SSEEvent) {
        let { event, data } = ev
        if (event === 'reasoning_start') event = 'thought_start'
        else if (event === 'reasoning_chunk') event = 'thought_chunk'
        else if (event === 'reasoning') event = 'thought'

        switch (event) {
          case 'connected': break

          case 'planning': {
            const text = ((data.content as string) || (data.summary as string) || '')
            const todosRaw = (data.todos as Array<{ content: string; status?: string }>) ?? []
            const todos = todosRaw.map((t) => ({ content: t.content, status: t.status }))
            const scopeRaw = String(data.scope ?? 'master').toLowerCase()
            const planScope: 'master' | 'adaptive' = scopeRaw === 'adaptive' ? 'adaptive' : 'master'
            const title = planScope === 'adaptive' ? '穿插规划' : '规划'
            const planId = `plan-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
            setStreamState((s) => ({
              ...s,
              planning: { content: text, todos },
              timeline: [...s.timeline, { id: planId, type: 'planning', title, body: text, todos, planScope, status: 'done' }],
            }))
            break
          }

          case 'thought_start': {
            const iteration = Number(data.iteration ?? 1)
            const stepKey = (data.step_key as string) || `iter-${iteration}`
            thoughtSeqRef.current += 1
            const id = `thought-${stepKey}-${thoughtSeqRef.current}`
            activeThoughtIdByStepRef.current.set(stepKey, id)
            setStreamState((s) => ({
              ...s,
              thought: { iteration, content: '' },
              thoughtChunks: new Map(s.thoughtChunks).set(stepKey, ''),
              timeline: [...s.timeline, { id, type: 'thought', title: '推理', body: '', iteration, status: 'running' }],
            }))
            break
          }

          case 'thought_chunk': {
            const iteration = Number(data.iteration ?? 1)
            const stepKey = (data.step_key as string) || `iter-${iteration}`
            const chunk = (data.chunk as string) ?? (data.content as string) ?? ''
            if (!chunk) break
            const id = activeThoughtIdByStepRef.current.get(stepKey) ?? `thought-${stepKey}`
            setStreamState((s) => {
              const newChunks = new Map(s.thoughtChunks)
              newChunks.set(stepKey, (newChunks.get(stepKey) ?? '') + chunk)
              const body = newChunks.get(stepKey) ?? ''
              return {
                ...s,
                thoughtChunks: newChunks,
                thought: s.thought ? { ...s.thought, content: body } : null,
                timeline: upsertTimelineItem(s.timeline, id, (prev) => prev ? { ...prev, body, title: '推理', iteration, status: prev.status ?? 'running' } : { id, type: 'thought', title: '推理', body, iteration, status: 'running' }),
              }
            })
            break
          }

          case 'thought': {
            const iteration = Number(data.iteration ?? 1)
            const stepKey = (data.step_key as string) || `iter-${iteration}`
            const content = (data.content as string) ?? ''
            const id = activeThoughtIdByStepRef.current.get(stepKey) ?? `thought-${stepKey}`
            setStreamState((s) => ({
              ...s,
              thought: { iteration, content },
              timeline: upsertTimelineItem(s.timeline, id, (prev) => prev ? { ...prev, title: '推理', body: content || prev.body, iteration, status: 'done' } : { id, type: 'thought', title: '推理', body: content, iteration, status: 'done' }),
            }))
            activeThoughtIdByStepRef.current.delete(stepKey)
            break
          }

          case 'action_start': {
            const toolName = (data.tool as string) ?? 'unknown'
            const params = (data.params as Record<string, unknown>) ?? {}
            const stepKey = (data.step_key as string) ?? `iter-${data.iteration ?? 0}`
            const actionId = `action-${stepKey}-${toolName}-${Date.now()}`
            let body = '状态: 执行中'
            if (toolName === 'execute_command') {
              const command = String(params.command ?? '').trim()
              if (command) body = `命令: ${command}\n${body}`
            }
            setStreamState((s) => ({
              ...s,
              actions: [...s.actions, { tool: toolName, params, viewType: ((data.view_type as string) ?? 'raw') as 'raw' | 'summary' }],
              timeline: [...s.timeline, { id: actionId, type: 'action', title: `工具调用 · ${toolName || 'unknown'}`, body, tool: toolName, params, status: 'running' }],
            }))
            break
          }

          case 'action_result':
          case 'action_end': {
            const toolName = (data.tool as string) ?? ''
            const ok = data.success !== false
            setStreamState((s) => {
              const actions = [...s.actions]
              const lastIdx = actions.findLastIndex((a: { tool: string }) => a.tool === toolName)
              if (lastIdx >= 0) {
                actions[lastIdx] = {
                  ...actions[lastIdx],
                  success: ok,
                  result: data.result,
                  error: data.error !== undefined ? String(data.error) : undefined,
                  viewType: ((data.view_type as string) ?? actions[lastIdx].viewType ?? 'raw') as 'raw' | 'summary',
                }
              }
              const timeline = [...s.timeline]
              const realIdx = timeline.findLastIndex((t: StreamTimelineItem) => t.type === 'action' && t.tool === toolName && t.status === 'running')
              if (realIdx >= 0) {
                const prev = timeline[realIdx]
                const command = toolName === 'execute_command' ? String(prev.params?.command ?? '').trim() : ''
                const prefix = command ? `命令: ${command}\n` : ''
                timeline[realIdx] = {
                  ...timeline[realIdx],
                  body: `${prefix}状态: ${ok ? '完成' : '失败'}${data.error ? `\n错误: ${String(data.error)}` : ''}`,
                  success: ok,
                  result: data.result,
                  error: data.error !== undefined ? String(data.error) : undefined,
                  status: 'done',
                }
                if (!TRANSIENT_TOOLS.has(toolName)) {
                  timeline.splice(realIdx + 1, 0, {
                    id: `obs-${toolName}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`,
                    type: 'observation',
                    title: `观察 · ${toolName}`,
                    body: buildObservationBody(toolName, data.result, ok, data.error !== undefined ? String(data.error) : undefined),
                    tool: toolName,
                    status: 'done',
                    success: ok,
                    error: data.error !== undefined ? String(data.error) : undefined,
                    result: data.result,
                  })
                }
              }
              return { ...s, actions, timeline }
            })
            break
          }

          case 'content': {
            if (((data.view_type as string) ?? 'summary') === 'raw') break
            const obs = (data.content as string) ?? ''
            const obsTool = (data.tool as string) ?? ''
            const obsIteration = Number(data.iteration ?? 0)
            const obsTitle = obsTool ? `观察 · ${obsTool}${obsIteration ? ` #${obsIteration}` : ''}` : '总结观察'
            appendContent(obs)
            setStreamState((s) => ({
              ...s,
              timeline: [...s.timeline, { id: `observation-${s.timeline.length}`, type: 'observation', title: obsTitle, body: obs, tool: obsTool || undefined, iteration: obsIteration || undefined, status: 'done' }],
            }))
            break
          }

          case 'report':
            setStreamState((s) => ({ ...s, report: (data.content as string) ?? '' }))
            break

          case 'phase':
            setStreamState((s) => ({ ...s, phase: (data.phase as string) ?? '', detail: (data.detail as string) ?? '' }))
            break

          case 'context_usage': {
            const focusRaw = data.focus
            const focus = Array.isArray(focusRaw) ? (focusRaw as unknown[]).filter((x): x is string => typeof x === 'string') : []
            const rawRatio = Number(data.ratio ?? 0)
            const ratio = Number.isFinite(rawRatio) && rawRatio >= 0 ? Math.min(1, rawRatio) : 0
            setStreamState((s) => ({
              ...s,
              contextUsage: {
                model: typeof data.model === 'string' ? data.model : null,
                contextWindow: Number(data.context_window ?? 0),
                promptBudget: Number(data.prompt_budget ?? 0),
                usedTokens: Number(data.used_tokens ?? 0),
                reservedTokens: Number(data.reserved_tokens ?? 0),
                ratio, focus, pinned: Number(data.pinned ?? 0), updatedAt: Date.now(),
              },
            }))
            break
          }

          case 'explore_start': {
            const focusRaw = data.focus
            const focus = Array.isArray(focusRaw) ? (focusRaw as unknown[]).filter((x): x is string => typeof x === 'string') : []
            const traceId = `browser-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
            currentBrowserTraceIdRef.current = traceId
            browserStepCounterRef.current = 0
            const startStep: BrowserStep = { index: browserStepCounterRef.current++, kind: 'start', detail: focus.length > 0 ? `focus: ${focus.join(', ')}` : '', ts: Date.now() }
            setStreamState((s) => ({
              ...s,
              timeline: [...s.timeline, { id: traceId, type: 'browser_event', title: 'ExploreAgent · 浏览路径', body: '', browserSteps: [startStep], focus, status: 'running' }],
            }))
            break
          }

          case 'explore_step': {
            const traceId = currentBrowserTraceIdRef.current
            if (!traceId) break
            const kindRaw = String(data.kind ?? 'thought')
            const validKinds: BrowserStep['kind'][] = ['start', 'thought', 'action_start', 'action_result', 'action_error', 'sensitive_denied', 'end']
            const kind = validKinds.includes(kindRaw as BrowserStep['kind']) ? (kindRaw as BrowserStep['kind']) : 'thought'
            const tool = typeof data.tool === 'string' && data.tool ? data.tool : undefined
            const params = (data.params ?? {}) as Record<string, unknown>
            let target: string | undefined
            if (tool === 'browser_session') {
              if (typeof params.url === 'string') target = params.url
              else if (typeof params.query === 'string') target = params.query
              else if (typeof params.link_id === 'string') target = `link:${params.link_id}`
              else if (typeof params.action === 'string') target = `action:${params.action}`
            }
            let detail = ''
            if (typeof data.thought === 'string' && data.thought) {
              const thought = data.thought.trim()
              detail = thought.length > 200 ? `${thought.slice(0, 200)}...` : thought
            } else if (typeof data.observation === 'string' && data.observation) {
              const observation = data.observation.trim()
              detail = observation.length > 200 ? `${observation.slice(0, 200)}...` : observation
            }
            const step: BrowserStep = {
              index: browserStepCounterRef.current++,
              kind,
              tool,
              target,
              detail,
              ok: kind === 'action_error' || kind === 'sensitive_denied' ? false : undefined,
              ts: Date.now(),
            }
            setStreamState((s) => ({
              ...s,
              timeline: upsertTimelineItem(s.timeline, traceId, (prev) => ({
                id: traceId, type: 'browser_event', title: prev?.title ?? 'ExploreAgent · 浏览路径', body: prev?.body ?? '',
                browserSteps: [...(prev?.browserSteps ?? []), step], focus: prev?.focus, status: 'running',
              })),
            }))
            break
          }

          case 'explore_end': {
            const traceId = currentBrowserTraceIdRef.current
            if (!traceId) break
            const factsCount = Number(data.facts_count ?? 0)
            const unresolved = Array.isArray(data.unresolved) ? (data.unresolved as unknown[]).filter((x): x is string => typeof x === 'string') : []
            const summary = typeof data.summary === 'string' ? data.summary : ''
            const endStep: BrowserStep = { index: browserStepCounterRef.current++, kind: 'end', detail: summary || (factsCount > 0 ? `补充 ${factsCount} 条事实` : ''), ts: Date.now() }
            setStreamState((s) => ({
              ...s,
              timeline: upsertTimelineItem(s.timeline, traceId, (prev) => ({
                id: traceId, type: 'browser_event', title: prev?.title ?? 'ExploreAgent · 浏览路径', body: prev?.body ?? '',
                browserSteps: [...(prev?.browserSteps ?? []), endStep], focus: prev?.focus,
                exploreSummary: { factsCount, unresolved, summary }, status: 'done',
              })),
            }))
            currentBrowserTraceIdRef.current = null
            break
          }

          case 'response_chunk': {
            const chunk = (data.chunk as string) ?? ''
            if (!chunk) break
            receivedChunksRef.current = true
            setStreamState((s) => {
              const hasSteps = s.timeline.some((item) => item.type === 'thought' || item.type === 'action')
              const newResponse = (s.response ?? '') + chunk
              return {
                  ...s,
                  response: newResponse,
                  timeline: hasSteps
                  ? upsertTimelineItem(s.timeline, 'final-summary', () => ({ id: 'final-summary', type: 'final', title: '最终总结', body: newResponse, status: 'running' }))
                  : s.timeline,
              }
            })
            break
          }

          case 'response': {
            const fullText = (data.content as string) ?? null
            if (fullText) {
              if (receivedChunksRef.current) {
                setStreamState((s) => ({
                  ...s,
                  response: fullText,
                  timeline: upsertTimelineItem(s.timeline, 'final-summary', (prev) =>
                    prev ? { ...prev, body: fullText, status: 'done' } : { id: 'final-summary', type: 'final', title: '最终总结', body: fullText, status: 'done' },
                  ),
                }))
              } else {
                setStreamState((s) => {
                  const hasSteps = s.timeline.some((item) => item.type === 'thought' || item.type === 'action')
                  return {
                    ...s,
                    timeline: hasSteps
                      ? upsertTimelineItem(s.timeline, 'final-summary', () => ({ id: 'final-summary', type: 'final', title: '最终总结', body: '', status: 'running' }))
                      : s.timeline,
                  }
                })
                startTypewriter(fullText)
              }
            }
            break
          }

          case 'error': {
            const base = (data.error as string)?.trim() || 'Unknown error'
            const code = String((data as { code?: string }).code ?? '')
            let message = base
            if (code === 'LLM_AUTH_FAILED') {
              message = `${base}\n\n可打开模型配置，检查 API Key 与厂商地址。`
            } else if (code === 'LLM_NETWORK' || code === 'LLM_UNAVAILABLE') {
              message = `${base}\n\n请确认后端已启动且本机网络正常。`
            }
            setStreamState((s) => ({ ...s, error: message }))
            break
          }

          case 'done': break
          default: break
        }
      },

      onDone: () => {
        completedAtRef.current = Date.now()
        setStreaming(false)
        // Persist current exchange to history immediately
        setHistory(h => {
          const current = streamStateRef.current
          if (currentUserMessageRef.current && (current.timeline.length > 0 || current.response)) {
            const item: HistoryItem = {
              userMessage: currentUserMessageRef.current,
              sentAt: currentSentAtRef.current,
              streamState: current,
              completedAt: completedAtRef.current,
            }
            return [...h, item]
          }
          return h
        })
      },

      onError: (err) => {
        clearTypewriter()
        const raw = err.message || String(err)
        const lower = raw.toLowerCase()
        const friendly = lower.includes('abort') ? '请求已取消。'
          : lower.includes('failed to fetch') || lower.includes('networkerror') || lower.includes('econnrefused') ? '无法连接服务端，请确认后端已启动且 SECBOT_API_URL 正确。'
          : raw
        setStreamState((s) => ({ ...s, error: friendly }))
        completedAtRef.current = Date.now()
        setStreaming(false)
      },
    })

    abortRef.current = controller
  }, [appendContent, sessionId, clearTypewriter, startTypewriter, upsertTimelineItem])

  const stopStream = useCallback(() => { abortRef.current?.abort() }, [])

  return { streaming, streamState, history, sendMessage, stopStream }
}
