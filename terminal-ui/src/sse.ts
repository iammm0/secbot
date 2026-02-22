/**
 * SSE 客户端 — 用于流式聊天（POST + ReadableStream）
 * 与 app/src/api/sse.ts 契约一致，适配 Node 环境
 */
import { getBaseUrl, CONNECTION_TIMEOUT_MS } from './config.js';
import type { SSEEvent } from './types.js';

export interface SSECallbacks {
  onEvent: (event: SSEEvent) => void;
  onError?: (error: Error) => void;
  onDone?: () => void;
}

function parseSSESegment(segment: string): { event: string; data: string } | null {
  const lines = segment.split('\n');
  let event = 'message';
  const dataLines: string[] = [];
  for (const line of lines) {
    if (line.startsWith('event:')) {
      event = line.slice(6).trim();
    } else if (line.startsWith('data:')) {
      dataLines.push(line.slice(5).trim());
    }
  }
  if (dataLines.length === 0) return null;
  return { event, data: dataLines.join('\n') };
}

function normalizeSSEText(text: string): string {
  return text.replace(/\r\n/g, '\n');
}

export function connectSSE(
  path: string,
  body: Record<string, unknown>,
  callbacks: SSECallbacks
): AbortController {
  const controller = new AbortController();
  const url = `${getBaseUrl()}${path}`;
  let connectionTimeoutId: ReturnType<typeof setTimeout> | null = null;

  const clearConnectionTimeout = () => {
    if (connectionTimeoutId != null) {
      clearTimeout(connectionTimeoutId);
      connectionTimeoutId = null;
    }
  };

  (async () => {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`SSE HTTP ${response.status}: ${text.slice(0, 200)}`);
      }

      const reader = response.body?.getReader();
      let hasDoneEvent = false;

      const emitParsedEvent = (eventName: string, rawData: string) => {
        try {
          const parsedData = JSON.parse(rawData) as Record<string, unknown>;
          callbacks.onEvent({ event: eventName, data: parsedData });
        } catch {
          callbacks.onEvent({ event: eventName, data: { raw: rawData } });
        }
        if (eventName === 'done' && !hasDoneEvent) {
          hasDoneEvent = true;
          callbacks.onDone?.();
        }
      };

      if (reader) {
        const decoder = new TextDecoder();
        let buffer = '';
        let hasReceivedEvent = false;

        connectionTimeoutId = setTimeout(() => {
          if (hasReceivedEvent) return;
          controller.abort();
          callbacks.onError?.(new Error('连接超时，请确认后端已启动且 SECBOT_API_URL 正确'));
        }, CONNECTION_TIMEOUT_MS);

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const normalized = normalizeSSEText(buffer);
          const parts = normalized.split('\n\n');
          buffer = parts.pop() ?? '';
          for (const segment of parts) {
            const parsed = parseSSESegment(segment);
            if (!parsed) continue;
            hasReceivedEvent = true;
            clearConnectionTimeout();
            emitParsedEvent(parsed.event, parsed.data);
          }
        }
        if (buffer.trim()) {
          const parsed = parseSSESegment(buffer);
          if (parsed) {
            emitParsedEvent(parsed.event, parsed.data);
          }
        }
        clearConnectionTimeout();
        if (!hasDoneEvent) callbacks.onDone?.();
      } else {
        const fullText = await response.text();
        const normalized = normalizeSSEText(fullText);
        const parts = normalized.split('\n\n');
        for (const segment of parts) {
          const parsed = parseSSESegment(segment);
          if (!parsed) continue;
          emitParsedEvent(parsed.event, parsed.data);
        }
        if (!hasDoneEvent) callbacks.onDone?.();
      }
    } catch (err: unknown) {
      clearConnectionTimeout();
      if (err instanceof Error && err.name !== 'AbortError') {
        callbacks.onError?.(err);
      }
    }
  })();

  return controller;
}
