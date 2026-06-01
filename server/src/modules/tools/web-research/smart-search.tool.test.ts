import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../common/llm', () => ({
  createLLM: () => ({
    chat: vi.fn().mockResolvedValue('综合摘要'),
    chatStream: vi.fn(),
  }),
}));

import { SmartSearchTool } from './smart-search.tool';

type MockResponseInit = {
  ok: boolean;
  status?: number;
  contentType?: string;
  text?: string;
  url?: string;
};

function makeResponse(init: MockResponseInit): Response {
  return {
    ok: init.ok,
    status: init.status ?? (init.ok ? 200 : 500),
    url: init.url ?? 'https://example.com',
    headers: {
      get: (name: string) =>
        name.toLowerCase() === 'content-type' ? (init.contentType ?? 'text/html') : null,
    },
    text: vi.fn().mockResolvedValue(init.text ?? ''),
  } as unknown as Response;
}

describe('SmartSearchTool', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns parsed search results on first successful fetch', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        makeResponse({
          ok: true,
          text:
            '<a rel="nofollow" href="https://example.com/advisory">最新安全公告</a>' +
            '<td class="result-snippet">近期披露高危漏洞</td>',
        }),
      )
      .mockResolvedValueOnce(
        makeResponse({
          ok: true,
          text: '<html><body>advisory body</body></html>',
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    const tool = new SmartSearchTool();
    const result = await tool.run({ query: '最新漏洞情况', summarize: false });

    expect(result.success).toBe(true);
    expect((result.result as { total: number }).total).toBe(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('retries transient search failures and eventually succeeds', async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('fetch failed'))
      .mockResolvedValueOnce(
        makeResponse({
          ok: true,
          text:
            '<a rel="nofollow" href="https://example.com/advisory">最新安全公告</a>' +
            '<td class="result-snippet">近期披露高危漏洞</td>',
        }),
      )
      .mockResolvedValueOnce(
        makeResponse({
          ok: true,
          text: '<html><body>advisory body</body></html>',
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    const tool = new SmartSearchTool();
    const result = await tool.run({ query: '最新漏洞情况', summarize: false });

    expect(result.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('returns a stable unavailable error after repeated transient failures', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('fetch failed')));

    const tool = new SmartSearchTool();
    const result = await tool.run({ query: '最新漏洞情况', summarize: false });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Real-time search is temporarily unavailable.');
    expect(result.result).toEqual({
      query: '最新漏洞情况',
      code: 'SEARCH_UNAVAILABLE',
      retryable: true,
    });
  });

  it('returns an empty-result success when the provider responds without parsable hits', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          makeResponse({ ok: true, text: '<html><body><p>no matching anchors</p></body></html>' }),
        ),
    );

    const tool = new SmartSearchTool();
    const result = await tool.run({ query: '最新漏洞情况', summarize: false });

    expect(result.success).toBe(true);
    expect(result.result).toEqual({
      query: '最新漏洞情况',
      message: 'No relevant search results found.',
      results: [],
    });
  });

  it('keeps overall success when summarization fails', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        makeResponse({
          ok: true,
          text:
            '<a rel="nofollow" href="https://example.com/advisory">最新安全公告</a>' +
            '<td class="result-snippet">近期披露高危漏洞</td>',
        }),
      )
      .mockResolvedValueOnce(
        makeResponse({
          ok: true,
          text: '<html><body>advisory body</body></html>',
        }),
      );
    vi.stubGlobal('fetch', fetchMock);

    const tool = new SmartSearchTool();
    const summarizeSpy = vi
      .spyOn(
        tool as unknown as { summarize: (query: string, contents: string[]) => Promise<string> },
        'summarize',
      )
      .mockResolvedValue('');

    const result = await tool.run({ query: '最新漏洞情况', summarize: true });

    expect(result.success).toBe(true);
    expect((result.result as { total: number }).total).toBe(1);
    expect(summarizeSpy).toHaveBeenCalled();
  });
});
