import { describe, expect, it, vi, afterEach } from 'vitest';
import { IntentRouter } from './intent-router';
import { SECBOT_GLOBAL_BRIEF } from './secbot-profile';
import type { ChatMessage } from '../../../common/types';
import { clearJevEnv, setJevRuntimeConfig } from '../../../common/jev';

function intentJson(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    intent: 'meta',
    confidence: 0.9,
    needs_explore: false,
    needs_report: false,
    focus: [],
    direct_response: '我是 Secbot，可做授权范围内的侦察和漏扫。',
    clarify_question: null,
    rationale: '询问产品能力',
    ...overrides,
  });
}

describe('IntentRouter context sync', () => {
  it('injects global Secbot brief, tool catalog, and pinned session facts', async () => {
    const llm = { chat: vi.fn().mockResolvedValue(intentJson()), chatStream: vi.fn() };
    const router = new IntentRouter(llm as never);

    await router.classify({
      userInput: '你能做什么？现在有哪些工具？',
      recentMessages: [
        {
          role: 'assistant',
          content: `${'observation dump '.repeat(80)}keep-tail`,
        },
      ],
      sessionFocus: ['10.0.0.8'],
      unresolved: ['缺授权确认'],
      pinnedFacts: ['target=10.0.0.8 仅授权端口扫描'],
      pausedTask: {
        originalMessage: '扫描 10.0.0.8 开放端口',
        progressNote: 'nmap 未完成',
      },
      agentType: 'hackbot',
      modelName: 'qwen-plus',
      toolCatalog: 'Core Security(1): nmap_scan',
    });

    expect(llm.chat).toHaveBeenCalledTimes(1);
    const messages = llm.chat.mock.calls[0][0] as ChatMessage[];
    const system = messages[0].content;
    const user = messages[messages.length - 1].content;
    const recent = messages[1].content;

    expect(system).toContain(SECBOT_GLOBAL_BRIEF.slice(0, 40));
    expect(system).toContain('授权范围内的安全自动化工作台');
    expect(user).toContain('agent=hackbot');
    expect(user).toContain('model=qwen-plus');
    expect(user).toContain('10.0.0.8');
    expect(user).toContain('target=10.0.0.8 仅授权端口扫描');
    expect(user).toContain('nmap 未完成');
    expect(user).toContain('nmap_scan');
    expect(user).toContain('缺授权确认');
    expect(recent.length).toBeLessThanOrEqual(481);
    expect(recent.endsWith('…') || recent.includes('keep-tail')).toBe(true);
  });

  it('does not force explore when the session already knows the entity', async () => {
    const llm = {
      chat: vi.fn().mockResolvedValue(
        intentJson({
          intent: 'task_simple',
          direct_response: null,
          rationale: '重复已有目标',
        }),
      ),
      chatStream: vi.fn(),
    };
    const router = new IntentRouter(llm as never);
    const decision = await router.classify({
      userInput: '再扫一遍 10.0.0.8',
      recentMessages: [],
      sessionFocus: ['10.0.0.8'],
      pinnedFacts: ['target=10.0.0.8'],
    });
    expect(decision.intent).toBe('task_simple');
    expect(decision.needsExplore).toBe(false);
  });

  it('skips the classify LLM for obvious small talk', async () => {
    const llm = { chat: vi.fn().mockResolvedValue(intentJson()), chatStream: vi.fn() };
    const router = new IntentRouter(llm as never);
    const decision = await router.classify({
      userInput: '你好',
      recentMessages: [],
    });
    expect(decision.intent).toBe('small_talk');
    expect(decision.needsExplore).toBe(false);
    expect(llm.chat).not.toHaveBeenCalled();
  });
});

describe('IntentRouter Jev gate', () => {
  afterEach(() => {
    clearJevEnv();
  });

  function enableJev(): void {
    setJevRuntimeConfig({
      enabled: true,
      intent: true,
      qaLive: false,
      adaptive: false,
      reactStop: false,
      context: false,
      apiKey: 'sk-test',
      baseUrl: 'https://api.typesafe.ai',
      model: 'jev-latest',
      confidenceMin: 0.85,
      reactStopMin: 0.92,
    });
  }

  it('skips the classify LLM for a high-confidence Jev task_simple', async () => {
    enableJev();
    const llm = { chat: vi.fn(), chatStream: vi.fn() };
    const jev = {
      systemOne: vi.fn().mockResolvedValue({
        model: 'jev-latest',
        answers: {
          intent: {
            type: 'choice',
            choice: 'task_simple',
            probabilities: { task_simple: 0.93 },
            confidence: 0.93,
          },
          needs_explore: { type: 'noul', noul: 0.05 },
          needs_report: { type: 'noul', noul: 0.04 },
        },
      }),
    };
    const router = new IntentRouter(llm as never, jev as never);
    const decision = await router.classify({
      userInput: '对 10.0.0.8 ping 一下',
      recentMessages: [],
    });
    expect(decision.intent).toBe('task_simple');
    expect(decision.rationale).toBe('jev');
    expect(llm.chat).not.toHaveBeenCalled();
    expect(jev.systemOne).toHaveBeenCalledTimes(1);
  });

  it('still asks the LLM to write a meta reply after Jev classifies', async () => {
    enableJev();
    const llm = {
      chat: vi.fn().mockResolvedValue(
        JSON.stringify({ direct_response: '我是 Secbot。', clarify_question: null }),
      ),
      chatStream: vi.fn(),
    };
    const jev = {
      systemOne: vi.fn().mockResolvedValue({
        model: 'jev-latest',
        answers: {
          intent: {
            type: 'choice',
            choice: 'meta',
            probabilities: { meta: 0.91 },
            confidence: 0.91,
          },
          needs_explore: { type: 'noul', noul: 0.02 },
          needs_report: { type: 'noul', noul: 0.01 },
        },
      }),
    };
    const router = new IntentRouter(llm as never, jev as never);
    const decision = await router.classify({
      userInput: '你能做什么？',
      recentMessages: [],
      toolCatalog: 'nmap_scan',
    });
    expect(decision.intent).toBe('meta');
    expect(decision.directResponse).toContain('Secbot');
    expect(llm.chat).toHaveBeenCalledTimes(1);
    const messages = llm.chat.mock.calls[0][0] as ChatMessage[];
    expect(messages[0].content).toContain('意图已经判定');
    expect(messages[messages.length - 1].content).toContain('intent=meta');
  });

  it('falls back to LLM classify when Jev confidence is low', async () => {
    enableJev();
    const llm = {
      chat: vi.fn().mockResolvedValue(intentJson({ intent: 'qa', direct_response: null })),
      chatStream: vi.fn(),
    };
    const jev = {
      systemOne: vi.fn().mockResolvedValue({
        model: 'jev-latest',
        answers: {
          intent: {
            type: 'choice',
            choice: 'qa',
            probabilities: { qa: 0.4 },
            confidence: 0.4,
          },
          needs_explore: { type: 'noul', noul: 0.5 },
          needs_report: { type: 'noul', noul: 0.5 },
        },
      }),
    };
    const router = new IntentRouter(llm as never, jev as never);
    const decision = await router.classify({
      userInput: 'SSRF 怎么测',
      recentMessages: [],
    });
    expect(decision.intent).toBe('qa');
    expect(llm.chat).toHaveBeenCalledTimes(1);
  });
});
