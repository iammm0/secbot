import { ChatMessage } from '../types';
import { LLMProvider } from './llm.interface';

interface ResponseOutputItem {
  type?: string;
  content?: Array<{ type?: string; text?: string }>;
}

interface ResponsesApiResult {
  output_text?: string;
  output?: ResponseOutputItem[];
}

function extractOutputText(response: ResponsesApiResult): string {
  if (response.output_text) return response.output_text;
  return (response.output ?? [])
    .flatMap((item) => item.content ?? [])
    .filter((content) => content.type === 'output_text')
    .map((content) => content.text ?? '')
    .join('');
}

/**
 * Codex 中转使用 OpenAI Responses API，而非 Chat Completions API。
 */
export class CodexResponsesProvider implements LLMProvider {
  readonly model: string;

  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    model: string,
  ) {
    this.model = model;
  }

  private requestBody(messages: ChatMessage[], stream: boolean): string {
    return JSON.stringify({
      model: this.model,
      input: messages.map(({ role, content }) => ({ role, content })),
      stream,
    });
  }

  private async throwForFailedResponse(res: Response, mode: 'chat' | 'stream'): Promise<never> {
    const text = await res.text();
    throw new Error(`Codex Responses ${mode} failed: HTTP ${res.status} ${text.slice(0, 200)}`);
  }

  async chat(messages: ChatMessage[]): Promise<string> {
    const res = await fetch(`${this.baseUrl}/responses`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: this.requestBody(messages, false),
    });
    if (!res.ok) await this.throwForFailedResponse(res, 'chat');
    return extractOutputText((await res.json()) as ResponsesApiResult);
  }

  async chatStream(messages: ChatMessage[], onChunk: (chunk: string) => void): Promise<string> {
    const res = await fetch(`${this.baseUrl}/responses`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: this.requestBody(messages, true),
    });
    if (!res.ok) await this.throwForFailedResponse(res, 'stream');

    const reader = res.body?.getReader();
    if (!reader) throw new Error('No response body');

    const decoder = new TextDecoder();
    let buffer = '';
    let full = '';
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith('data: ')) continue;
        try {
          const event = JSON.parse(trimmed.slice(6)) as { delta?: string };
          if (event.delta) {
            full += event.delta;
            onChunk(event.delta);
          }
        } catch {
          /* skip malformed SSE events */
        }
      }
    }
    return full;
  }
}
