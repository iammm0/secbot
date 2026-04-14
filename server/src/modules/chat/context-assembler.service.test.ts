import { describe, expect, it, vi } from 'vitest';
import { ContextAssemblerService } from './context-assembler.service';
import { MessageRole, createSession } from '../../common/types';

describe('ContextAssemblerService', () => {
  it('融合会话、SQLite 与向量上下文并输出统计', async () => {
    const memoryService = {
      search_vector_memories: vi.fn().mockResolvedValue([
        {
          similarity: 0.91,
          item: {
            content: '用户曾经确认目标为 10.0.0.5',
            metadata: { sessionId: 's-1' },
          },
        },
      ]),
      remember: vi.fn(),
      add_vector_memory: vi.fn(),
    };
    const databaseService = {
      getConversations: vi.fn().mockReturnValue([
        {
          userMessage: '先做端口扫描',
          assistantMessage: '已建议使用 nmap -sV',
        },
      ]),
    };
    const service = new ContextAssemblerService(memoryService as never, databaseService as never);
    const session = createSession({ id: 's-1' });
    session.messages.push({
      role: MessageRole.USER,
      content: '继续上次任务',
      timestamp: new Date(),
      metadata: {},
    });

    const result = await service.build({
      query: '继续扫描',
      session,
      sessionId: 's-1',
      agentType: 'hackbot',
    });

    expect(result.contextBlock).toContain('【RecentSession】');
    expect(result.contextBlock).toContain('【SQLiteHistory】');
    expect(result.contextBlock).toContain('【VectorMemory】');
    expect(result.debug.sessionMessages).toBe(1);
    expect(result.debug.sqliteTurns).toBe(1);
    expect(result.debug.vectorHits).toBe(1);
  });

  it('记忆落库时写入短期、情节与向量记忆', async () => {
    const memoryService = {
      search_vector_memories: vi.fn().mockResolvedValue([]),
      remember: vi.fn().mockResolvedValue(undefined),
      add_vector_memory: vi.fn().mockResolvedValue('episodic:abcd1234'),
    };
    const databaseService = {
      getConversations: vi.fn().mockReturnValue([]),
    };
    const service = new ContextAssemblerService(memoryService as never, databaseService as never);

    await service.rememberTurn({
      sessionId: 's-2',
      agentType: 'hackbot',
      userMessage: '扫描 192.168.0.10',
      assistantMessage: '建议先探测存活主机',
    });

    expect(memoryService.remember).toHaveBeenCalledTimes(2);
    expect(memoryService.add_vector_memory).toHaveBeenCalledTimes(1);
  });
});
