import { getJevRuntimeConfig, type JevRuntimeConfig } from './jev-config';

export type JevQuestion =
  | { type: 'noul'; instructions: string; criteria?: { true: string; false: string } }
  | { type: 'choice'; instructions: string; criteria: Record<string, string> }
  | { type: 'score'; instructions: string; criteria: string[] };

export interface JevNoulAnswer {
  type: 'noul';
  noul: number;
}

export interface JevChoiceAnswer {
  type: 'choice';
  choice: string;
  probabilities: Record<string, number>;
  confidence: number;
}

export interface JevScoreAnswer {
  type: 'score';
  score: number;
  probabilities?: Record<string, number>;
  confidence: number;
  legend?: Record<string, string>;
}

export type JevAnswer = JevNoulAnswer | JevChoiceAnswer | JevScoreAnswer;

export interface JevSystemOneRequest {
  state: string | Record<string, unknown> | unknown[];
  questions: Record<string, JevQuestion>;
  model?: string;
}

export interface JevSystemOneResponse {
  model: string;
  answers: Record<string, JevAnswer>;
  usage?: { input_tokens?: number; output_tokens?: number };
}

const DEFAULT_TIMEOUT_MS = 10_000;

export class JevClientError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'JevClientError';
  }
}

export class JevClient {
  constructor(
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly resolveConfig: () => JevRuntimeConfig = getJevRuntimeConfig,
    private readonly timeoutMs = DEFAULT_TIMEOUT_MS,
  ) {}

  async systemOne(request: JevSystemOneRequest): Promise<JevSystemOneResponse> {
    const config = this.resolveConfig();
    if (!config.apiKey) {
      throw new JevClientError('Jev API key is not configured');
    }
    const base = config.baseUrl.replace(/\/+$/, '');
    const url = `${base}/v1/systemone`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const res = await this.fetchImpl(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          state: request.state,
          model: request.model ?? config.model,
          questions: request.questions,
        }),
        signal: controller.signal,
      });
      const rawText = await res.text();
      if (!res.ok) {
        throw new JevClientError(`Jev HTTP ${res.status}: ${rawText.slice(0, 240)}`, res.status);
      }
      const payload = JSON.parse(rawText) as JevSystemOneResponse;
      if (!payload || typeof payload !== 'object' || !payload.answers) {
        throw new JevClientError('Jev response missing answers');
      }
      return payload;
    } catch (error) {
      if (error instanceof JevClientError) throw error;
      if (error instanceof Error && error.name === 'AbortError') {
        throw new JevClientError(`Jev request timed out after ${this.timeoutMs}ms`);
      }
      throw new JevClientError(error instanceof Error ? error.message : String(error));
    } finally {
      clearTimeout(timer);
    }
  }
}

export function createJevClient(): JevClient {
  return new JevClient();
}
