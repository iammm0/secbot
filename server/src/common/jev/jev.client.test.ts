import { describe, expect, it, vi } from 'vitest';
import { JevClient, JevClientError } from './jev.client';

describe('JevClient', () => {
  it('posts state and questions to /v1/systemone', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: async () =>
        JSON.stringify({
          model: 'jev-1.13.0',
          answers: { urgency: { type: 'noul', noul: 0.91 } },
          usage: { input_tokens: 12, output_tokens: 4 },
        }),
    });
    const client = new JevClient(fetchImpl as unknown as typeof fetch, () => ({
      enabled: true,
      intent: true,
      qaLive: false,
      adaptive: false,
      reactStop: false,
      context: false,
      apiKey: 'sk-test',
      baseUrl: 'https://api.typesafe.ai/',
      model: 'jev-latest',
      confidenceMin: 0.85,
      reactStopMin: 0.92,
    }));

    const result = await client.systemOne({
      state: 'this is urgent',
      questions: { urgency: { type: 'noul', instructions: 'Urgent?' } },
    });

    expect(result.answers.urgency).toEqual({ type: 'noul', noul: 0.91 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.typesafe.ai/v1/systemone');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer sk-test');
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body.model).toBe('jev-latest');
    expect(body.state).toBe('this is urgent');
  });

  it('throws when the API key is missing', async () => {
    const client = new JevClient(vi.fn() as unknown as typeof fetch, () => ({
      enabled: true,
      intent: false,
      qaLive: false,
      adaptive: false,
      reactStop: false,
      context: false,
      apiKey: '',
      baseUrl: 'https://api.typesafe.ai',
      model: 'jev-latest',
      confidenceMin: 0.85,
      reactStopMin: 0.92,
    }));
    await expect(
      client.systemOne({ state: 'x', questions: { a: { type: 'noul', instructions: 'y' } } }),
    ).rejects.toBeInstanceOf(JevClientError);
  });

  it('maps HTTP errors without leaking the request key', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => 'unauthorized',
    });
    const client = new JevClient(fetchImpl as unknown as typeof fetch, () => ({
      enabled: true,
      intent: false,
      qaLive: false,
      adaptive: false,
      reactStop: false,
      context: false,
      apiKey: 'sk-secret',
      baseUrl: 'https://api.typesafe.ai',
      model: 'jev-latest',
      confidenceMin: 0.85,
      reactStopMin: 0.92,
    }));
    await expect(
      client.systemOne({ state: 'x', questions: { a: { type: 'noul', instructions: 'y' } } }),
    ).rejects.toThrow(/Jev HTTP 401/);
  });
});
