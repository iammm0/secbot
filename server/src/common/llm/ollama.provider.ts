import { ChatMessage } from '../types';
import { LLMProvider } from './llm.interface';

export class OllamaProvider implements LLMProvider {
  constructor(
    private readonly baseUrl: string = 'http://localhost:11434',
    private readonly model: string = 'llama3.2',
  ) {}

  async chat(messages: ChatMessage[]): Promise<string> {
    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: this.model, messages, stream: false }),
    });
    if (!res.ok) {
      throw new Error(`Ollama chat failed: HTTP ${res.status}`);
    }
    const json = (await res.json()) as { message?: { content?: string } };
    return json.message?.content ?? '';
  }

  async chatStream(messages: ChatMessage[], onChunk: (chunk: string) => void): Promise<string> {
    const res = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: this.model, messages, stream: true }),
    });
    if (!res.ok) {
      throw new Error(`Ollama stream failed: HTTP ${res.status}`);
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
        if (!line.trim()) continue;
        try {
          const obj = JSON.parse(line) as {
            message?: { content?: string };
            done?: boolean;
          };
          const chunk = obj.message?.content ?? '';
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
