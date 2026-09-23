import { afterEach, describe, expect, it, vi } from 'vitest';
import { SecurityReActAgent } from './security-react-agent';
import { BaseTool, type ToolResult } from '../../tools/core/base-tool';
import { clearJevEnv, setJevRuntimeConfig } from '../../../common/jev';

class PingTool extends BaseTool {
  constructor() {
    super('ping_tool', 'ping a host', false);
  }
  async run(): Promise<ToolResult> {
    return { success: true, result: 'host 10.0.0.8 is up' };
  }
}

describe('SecurityReActAgent Jev stop nudge', () => {
  afterEach(() => {
    clearJevEnv();
  });

  it('asks for Final Answer after a confident stop gate', async () => {
    setJevRuntimeConfig({
      enabled: true,
      intent: false,
      qaLive: false,
      adaptive: false,
      reactStop: true,
      context: false,
      apiKey: 'sk-test',
      baseUrl: 'https://api.typesafe.ai',
      model: 'jev-latest',
      confidenceMin: 0.85,
      reactStopMin: 0.92,
    });
    const jev = {
      systemOne: vi.fn().mockResolvedValue({
        model: 'jev-latest',
        answers: {
          progress: { type: 'score', score: 1.9, confidence: 0.93 },
          can_stop: { type: 'noul', noul: 0.97 },
        },
      }),
    };
    const llm = {
      chat: vi
        .fn()
        .mockResolvedValueOnce(
          'Thought: ping it\nAction: {"tool":"ping_tool","params":{"host":"10.0.0.8"}}',
        )
        .mockResolvedValueOnce('Thought: done\nFinal Answer: 主机存活'),
      chatStream: vi.fn(),
    };
    const agent = new SecurityReActAgent(
      'test',
      'sys',
      [new PingTool()],
      false,
      5,
      jev as never,
    );
    Object.defineProperty(agent, 'llm', { value: llm, configurable: true });

    const answer = await agent.process('ping 10.0.0.8');
    expect(answer).toContain('主机存活');
    expect(llm.chat).toHaveBeenCalledTimes(2);
    const second = llm.chat.mock.calls[1][0] as Array<{ content: string }>;
    expect(second.some((msg) => msg.content.includes('Final Answer'))).toBe(true);
  });

  it('continues the loop when Jev is uncertain', async () => {
    setJevRuntimeConfig({
      enabled: true,
      intent: false,
      qaLive: false,
      adaptive: false,
      reactStop: true,
      context: false,
      apiKey: 'sk-test',
      baseUrl: 'https://api.typesafe.ai',
      model: 'jev-latest',
      confidenceMin: 0.85,
      reactStopMin: 0.92,
    });
    const jev = {
      systemOne: vi.fn().mockResolvedValue({
        model: 'jev-latest',
        answers: {
          progress: { type: 'score', score: 0.4, confidence: 0.9 },
          can_stop: { type: 'noul', noul: 0.2 },
        },
      }),
    };
    const llm = {
      chat: vi
        .fn()
        .mockResolvedValueOnce(
          'Thought: ping it\nAction: {"tool":"ping_tool","params":{"host":"10.0.0.8"}}',
        )
        .mockResolvedValueOnce('Thought: still going\nFinal Answer: 继续观察后结束'),
      chatStream: vi.fn(),
    };
    const agent = new SecurityReActAgent(
      'test',
      'sys',
      [new PingTool()],
      false,
      5,
      jev as never,
    );
    Object.defineProperty(agent, 'llm', { value: llm, configurable: true });
    await agent.process('ping 10.0.0.8');
    const second = llm.chat.mock.calls[1][0] as Array<{ content: string }>;
    expect(second.some((msg) => msg.content.includes('已足够收束'))).toBe(false);
  });
});
