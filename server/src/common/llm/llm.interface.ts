import { ChatMessage } from '../types';

export interface LLMProvider {
  chat(messages: ChatMessage[]): Promise<string>;
  chatStream(messages: ChatMessage[], onChunk: (chunk: string) => void): Promise<string>;
}
