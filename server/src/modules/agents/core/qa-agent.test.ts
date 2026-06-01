import { describe, expect, it, vi } from 'vitest';
import { QAAgent, extractCveId, isLiveSecurityQuery } from './qa-agent';
import type { ChatMessage } from '../../../common/types';

describe('QAAgent live retrieval helpers', () => {
  it('detects freshness-sensitive security questions', () => {
    expect(isLiveSecurityQuery('最新出的零日')).toBe(true);
    expect(isLiveSecurityQuery('最近有哪些高危漏洞')).toBe(true);
    expect(isLiveSecurityQuery('近期 Exchange 漏洞情况')).toBe(true);
    expect(isLiveSecurityQuery('什么是零日漏洞')).toBe(false);
    expect(isLiveSecurityQuery('你能做什么')).toBe(false);
  });

  it('extracts CVE ids case-insensitively', () => {
    expect(extractCveId('帮我看看 cve-2025-12345')).toBe('CVE-2025-12345');
    expect(extractCveId('没有编号')).toBeNull();
  });
});

describe('QAAgent.answerAdaptive', () => {
  it('uses live search for latest vulnerability questions', async () => {
    const agent = new QAAgent();
    const llm = {
      chat: vi.fn().mockResolvedValue('综合后的最新漏洞回答'),
      chatStream: vi.fn(),
    };
    const smartSearchTool = {
      run: vi.fn().mockResolvedValue({
        success: true,
        result: {
          query: '最新漏洞情况',
          total: 1,
          ai_summary: '检索到近期高危漏洞。',
          results: [
            {
              title: '安全公告',
              url: 'https://example.com/advisory',
              snippet: '近期披露高危漏洞。',
            },
          ],
        },
      }),
    };

    Object.defineProperty(agent, 'llm', {
      value: llm,
      configurable: true,
    });
    Object.assign(agent as object, {
      smartSearchTool,
      cveLookupTool: { run: vi.fn() },
    });

    const answer = await agent.answerAdaptive('最新漏洞情况', []);

    expect(answer).toBe('综合后的最新漏洞回答');
    expect(smartSearchTool.run).toHaveBeenCalledWith({
      query: '最新漏洞情况',
      max_results: 5,
      summarize: true,
    });
    expect(llm.chat).toHaveBeenCalledTimes(1);
    const messages = llm.chat.mock.calls[0][0] as ChatMessage[];
    expect(messages.some((msg) => msg.content.includes('实时检索结果（优先参考）'))).toBe(true);
    expect(messages.some((msg) => msg.content.includes('https://example.com/advisory'))).toBe(true);
  });

  it('returns stable fallback text when live search is unavailable', async () => {
    const agent = new QAAgent();
    const smartSearchTool = {
      run: vi.fn().mockResolvedValue({
        success: false,
        result: { code: 'SEARCH_UNAVAILABLE', retryable: true },
        error: 'Real-time search is temporarily unavailable.',
      }),
    };

    Object.defineProperty(agent, 'llm', {
      value: { chat: vi.fn(), chatStream: vi.fn() },
      configurable: true,
    });
    Object.assign(agent as object, {
      smartSearchTool,
      cveLookupTool: { run: vi.fn() },
    });

    const answer = await agent.answerAdaptive('最新漏洞情况', []);

    expect(answer).toBe(
      '暂时无法实时检索最新漏洞信息。请稍后重试，或给我更具体的厂商、产品或 CVE 编号。',
    );
  });

  it('uses CVE lookup for specific CVE questions', async () => {
    const agent = new QAAgent();
    const llm = {
      chat: vi.fn().mockResolvedValue('CVE 详情回答'),
      chatStream: vi.fn(),
    };
    const cveLookupTool = {
      run: vi.fn().mockResolvedValue({
        success: true,
        result: {
          cve_id: 'CVE-2025-12345',
          description: 'Test vulnerability',
          state: 'PUBLISHED',
          date_published: '2025-05-01',
          references: ['https://example.com/cve'],
        },
      }),
    };

    Object.defineProperty(agent, 'llm', {
      value: llm,
      configurable: true,
    });
    Object.assign(agent as object, {
      smartSearchTool: { run: vi.fn() },
      cveLookupTool,
    });

    const answer = await agent.answerAdaptive('CVE-2025-12345 是什么', []);

    expect(answer).toBe('CVE 详情回答');
    expect(cveLookupTool.run).toHaveBeenCalledWith({ cve_id: 'CVE-2025-12345' });
    const messages = llm.chat.mock.calls[0][0] as ChatMessage[];
    expect(messages.some((msg) => msg.content.includes('CVE: CVE-2025-12345'))).toBe(true);
  });
});
