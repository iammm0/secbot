import { describe, expect, it, vi } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { ChatService } from './chat.service';

describe('ChatService QA routing', () => {
  function createService(): ChatService {
    const contextAssembler = {
      updateFocusFromInput: vi.fn(),
      getStoreSnapshot: vi.fn().mockReturnValue({ focus: [], unresolved: [] }),
      build: vi.fn().mockResolvedValue({
        contextBlock: 'ctx',
        debug: {
          modelName: 'test-model',
          contextWindow: 8192,
          promptBudget: 4096,
          usedTokens: 128,
          reservedTokens: 512,
          focus: [],
          pinned: 0,
        },
      }),
      rememberTurn: vi.fn().mockResolvedValue(undefined),
      applyPatch: vi.fn(),
    };
    const toolsService = {
      getBasicTools: vi.fn().mockReturnValue([]),
      getBrowserSessionTool: vi.fn().mockReturnValue(null),
      getAllTools: vi.fn().mockReturnValue([]),
    };
    const databaseService = {
      saveConversation: vi.fn(),
    };

    return new ChatService(
      new ConfigService(),
      toolsService as never,
      databaseService as never,
      contextAssembler as never,
    );
  }

  it('uses answerAdaptive for routed QA requests', async () => {
    const service = createService();
    const qaAgent = {
      answerAdaptive: vi.fn().mockResolvedValue('live qa answer'),
    };
    const intentRouter = {
      classify: vi.fn().mockResolvedValue({
        intent: 'qa',
        confidence: 0.95,
        needsExplore: false,
        needsReport: false,
        focus: [],
        directResponse: 'stale direct response',
        clarifyQuestion: null,
        rationale: 'qa',
      }),
    };

    Object.assign(service as object, {
      qaAgent,
      intentRouter,
    });

    const events: Array<{ event: string; data: Record<string, unknown> }> = [];
    const response = await service.handleMessage(
      { message: '最新漏洞情况', mode: 'agent', agent: 'hackbot' },
      (event, data) => events.push({ event, data }),
    );

    expect(response).toBe('live qa answer');
    expect(qaAgent.answerAdaptive).toHaveBeenCalledTimes(1);
    expect(qaAgent.answerAdaptive).toHaveBeenCalledWith(
      '最新漏洞情况',
      expect.any(Array),
      'ctx',
    );
    expect(events.some((item) => item.event === 'response')).toBe(true);
  });

  it('uses answerAdaptive for routed QA sync requests', async () => {
    const service = createService();
    const qaAgent = {
      answerAdaptive: vi.fn().mockResolvedValue('sync live qa answer'),
    };
    const intentRouter = {
      classify: vi.fn().mockResolvedValue({
        intent: 'qa',
        confidence: 0.95,
        needsExplore: false,
        needsReport: false,
        focus: [],
        directResponse: null,
        clarifyQuestion: null,
        rationale: 'qa',
      }),
    };

    Object.assign(service as object, { qaAgent, intentRouter });

    const response = await service.chatSync({ message: '最新出的零日', mode: 'agent', agent: 'hackbot' });

    expect(response).toEqual({ response: 'sync live qa answer', agent: 'qa' });
    expect(qaAgent.answerAdaptive).toHaveBeenCalledWith('最新出的零日', expect.any(Array));
  });
});
