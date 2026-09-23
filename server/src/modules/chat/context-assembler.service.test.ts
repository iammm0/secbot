import { describe, expect, it, vi, afterEach } from 'vitest';
import { ContextAssemblerService } from './context-assembler.service';
import { ContextStoreService } from './context-store.service';
import { MessageRole, createSession } from '../../common/types';
import { clearJevEnv, setJevRuntimeConfig } from '../../common/jev';

describe('ContextAssemblerService', () => {
  afterEach(() => {
    clearJevEnv();
  });
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
    const preferences = {
      getCustomInstructions: vi.fn().mockReturnValue(''),
    };
    const service = new ContextAssemblerService(
      memoryService as never,
      databaseService as never,
      new ContextStoreService(),
      preferences as never,
    );
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
    expect(result.contextBlock).not.toContain('【SQLiteHistory】');
    expect(result.contextBlock).toContain('【VectorMemory】');
    expect(result.debug.sessionMessages).toBe(1);
    expect(result.debug.sqliteTurns).toBe(0);
    expect(result.debug.vectorHits).toBe(1);
    expect(result.debug.parts.some((part) => part.id === 'conversation' && part.tokens > 0)).toBe(
      true,
    );
    expect(result.debug.parts.some((part) => part.id === 'history' && part.tokens > 0)).toBe(false);
    expect(result.debug.parts.some((part) => part.id === 'memory' && part.tokens > 0)).toBe(true);
    expect(databaseService.getConversations).not.toHaveBeenCalled();
  });

  it('内存无会话消息时才叠 SQLite，task_simple 跳过向量', async () => {
    const memoryService = {
      search_vector_memories: vi.fn().mockResolvedValue([
        {
          similarity: 0.91,
          item: { content: '旧记忆', metadata: { sessionId: 's-empty' } },
        },
      ]),
      remember: vi.fn(),
      add_vector_memory: vi.fn(),
    };
    const databaseService = {
      getConversations: vi
        .fn()
        .mockReturnValue([
          { userMessage: '先做端口扫描', assistantMessage: '已建议使用 nmap -sV' },
        ]),
    };
    const preferences = { getCustomInstructions: vi.fn().mockReturnValue('') };
    const service = new ContextAssemblerService(
      memoryService as never,
      databaseService as never,
      new ContextStoreService(),
      preferences as never,
    );
    const session = createSession({ id: 's-empty' });
    const withSqlite = await service.build({
      query: '继续扫描',
      session,
      sessionId: 's-empty',
      agentType: 'hackbot',
    });
    expect(withSqlite.contextBlock).toContain('【SQLiteHistory】');
    expect(databaseService.getConversations).toHaveBeenCalled();

    const skipVec = await service.build({
      query: '再扫一遍',
      session,
      sessionId: 's-empty',
      agentType: 'hackbot',
      skipVector: true,
    });
    expect(memoryService.search_vector_memories).toHaveBeenCalledTimes(1);
    expect(skipVec.debug.vectorHits).toBe(0);
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
    const preferences = {
      getCustomInstructions: vi.fn().mockReturnValue(''),
    };
    const service = new ContextAssemblerService(
      memoryService as never,
      databaseService as never,
      new ContextStoreService(),
      preferences as never,
    );

    await service.rememberTurn({
      sessionId: 's-2',
      agentType: 'hackbot',
      userMessage: '扫描 192.168.0.10',
      assistantMessage: '建议先探测存活主机',
    });

    expect(memoryService.remember).toHaveBeenCalledTimes(2);
    expect(memoryService.add_vector_memory).toHaveBeenCalledTimes(1);
  });

  it('drops off-topic vector hits when the Jev context stage is on', async () => {
    setJevRuntimeConfig({
      enabled: true,
      intent: false,
      qaLive: false,
      adaptive: false,
      reactStop: false,
      context: true,
      apiKey: 'sk-test',
      baseUrl: 'https://api.typesafe.ai',
      model: 'jev-latest',
      confidenceMin: 0.85,
      reactStopMin: 0.92,
    });
    const memoryService = {
      search_vector_memories: vi.fn().mockResolvedValue([
        {
          similarity: 0.91,
          item: { id: 'keep', content: '目标 10.0.0.5 开放 22', metadata: { sessionId: 's-1' } },
        },
        {
          similarity: 0.88,
          item: { id: 'drop', content: 'unrelated cooking recipe', metadata: { sessionId: 's-1' } },
        },
      ]),
      remember: vi.fn(),
      add_vector_memory: vi.fn(),
    };
    const jev = {
      systemOne: vi.fn().mockResolvedValue({
        model: 'jev-latest',
        answers: {
          item_0: { type: 'noul', noul: 0.92 },
          item_1: { type: 'noul', noul: 0.08 },
        },
      }),
    };
    const service = new ContextAssemblerService(
      memoryService as never,
      { getConversations: vi.fn().mockReturnValue([]) } as never,
      new ContextStoreService(),
      { getCustomInstructions: vi.fn().mockReturnValue('') } as never,
    );
    service.jevClient = jev as never;
    const session = createSession({ id: 's-1' });
    const result = await service.build({
      query: '扫描 10.0.0.5',
      session,
      sessionId: 's-1',
      agentType: 'hackbot',
    });
    expect(result.contextBlock).toContain('10.0.0.5');
    expect(result.contextBlock).not.toContain('cooking recipe');
  });
});
