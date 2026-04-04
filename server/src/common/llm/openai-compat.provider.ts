import { ChatMessage } from '../types';
import { LLMProvider } from './llm.interface';

interface OpenAIChoice {
  message?: { content?: string };
  delta?: { content?: string };
}

export class OpenAICompatProvider implements LLMProvider {
  constructor(
    private readonly baseUrl: string,
    private readonly apiKey: string,
    private readonly model: string,
  ) {}

  async chat(messages: ChatMessage[]): Promise<string> {
    const res = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ model: this.model, messages, stream: false }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`OpenAI-compat chat failed: HTTP ${res.status} ${text.slice(0, 200)}`);
    }
    const json = (await res.json()) as { choices?: OpenAIChoice[] };
    return json.choices?.[0]?.message?.content ?? '';
  }

  async chatStream(
    messages: ChatMessage[],
    onChunk: (chunk: string) => void,
  ): Promise<string> {
    const res = await fetch(`${this.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({ model: this.model, messages, stream: true }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`OpenAI-compat stream failed: HTTP ${res.status} ${text.slice(0, 200)}`);
    }
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
        if (!trimmed || trimmed === 'data: [DONE]') continue;
        if (!trimmed.startsWith('data: ')) continue;
        try {
          const obj = JSON.parse(trimmed.slice(6)) as {
            choices?: OpenAIChoice[];
          };
          const chunk = obj.choices?.[0]?.delta?.content ?? '';
          if (chunk) {
            full += chunk;
            onChunk(chunk);
          }
        } catch {
          /* skip malformed lines */
        }
      }
    }
    return full;
  }
}
