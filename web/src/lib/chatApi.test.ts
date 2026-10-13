import { describe, expect, it } from 'vitest'
import {
  conversationToHistoryItem,
  isTitleOnlyPlaceholder,
  mergeHistory,
  type PersistedConversationRecord,
} from './chatApi'

function record(overrides: Partial<PersistedConversationRecord> = {}): PersistedConversationRecord {
  return {
    id: 23,
    timestamp: '2026-10-13T04:02:32.738Z',
    agentType: 'hackbot',
    userMessage: '巡检 localhost',
    assistantMessage: '巡检完成，以下是最终结论。',
    sessionId: 'session-1',
    metadata: JSON.stringify({
      timeline: [{
        id: 'plan',
        type: 'planning',
        title: '规划',
        todos: [{ id: 'scan', content: '扫描端口', status: 'completed' }],
      }],
    }),
    ...overrides,
  }
}

describe('conversationToHistoryItem', () => {
  it('restores the final assistant reply even when persisted timeline contains a plan', () => {
    const item = conversationToHistoryItem(record())

    expect(item.streamState.timeline.map((block) => block.type)).toEqual(['planning', 'final'])
    expect(item.streamState.timeline.at(-1)?.body).toBe('巡检完成，以下是最终结论。')
  })

  it('does not duplicate an already persisted final reply', () => {
    const assistantMessage = '已完成'
    const item = conversationToHistoryItem(record({
      assistantMessage,
      metadata: JSON.stringify({
        timeline: [{ id: 'final-summary', type: 'final', body: assistantMessage }],
      }),
    }))

    expect(item.streamState.timeline).toHaveLength(1)
  })
})

describe('isTitleOnlyPlaceholder', () => {
  it('identifies the empty row created only to persist a new session title', () => {
    expect(isTitleOnlyPlaceholder(record({
      userMessage: '巡检 localhost',
      assistantMessage: '',
      metadata: JSON.stringify({ title: '巡检 localhost', paused: null, timeline: [] }),
    }))).toBe(true)
  })

  it('keeps a real turn with an assistant reply', () => {
    expect(isTitleOnlyPlaceholder(record())).toBe(false)
  })
})

describe('mergeHistory', () => {
  it('keeps richer local traces while retaining the database conversation id', () => {
    const remote = conversationToHistoryItem(record())
    const local = {
      ...remote,
      conversationId: undefined,
      streamState: {
        ...remote.streamState,
        timeline: [
          ...remote.streamState.timeline,
          { id: 'tool', type: 'action' as const, title: 'nmap', body: 'done', status: 'done' as const },
        ],
      },
    }

    const [merged] = mergeHistory([remote], [local])
    expect(merged.conversationId).toBe(23)
    expect(merged.streamState.timeline).toHaveLength(3)
  })
})
