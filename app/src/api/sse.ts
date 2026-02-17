// ===================================================================
// SSE 客户端 — 用于流式聊天（POST + ReadableStream）
// 解析格式: event: xxx\ndata: yyy\n\n （支持分块到达、多行 data）
// ===================================================================

import { BASE_URL } from './client';
import type { SSEEvent } from '../types';

export interface SSECallbacks {
  onEvent: (event: SSEEvent) => void;
  onError?: (error: Error) => void;
  onDone?: () => void;
}

/**
 * 解析一个完整 SSE 段落（已按 \n\n 切分），提取 event 和 data。
 * data 可能有多行（多行 "data: xxx" 按 SSE 规范用 \n 连接）。
 */
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
  const data = dataLines.join('\n');
  return { event, data };
}

function normalizeSSEText(text: string): string {
  // sse-starlette 默认使用 CRLF，统一为 LF 便于分段解析
  return text.replace(/\r\n/g, '\n');
}

/** 若在此时间内未收到任何 SSE 事件则视为连接超时（毫秒） */
const CONNECTION_TIMEOUT_MS = 15000;

/**
 * 通过 POST 请求发起 SSE 流式连接。
 * 若在 CONNECTION_TIMEOUT_MS 内未收到任何事件会 abort 并触发 onError。
 * 返回 AbortController 用于取消请求。
 */
export function connectSSE(
  path: string,
  body: any,
  callbacks: SSECallbacks,
): AbortController {
  const controller = new AbortController();
  const url = `${BASE_URL}${path}`;
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
          const parsedData = JSON.parse(rawData);
          callbacks.onEvent({ event: eventName, data: parsedData });
        } catch {
          callbacks.onEvent({ event: eventName, data: { raw: rawData } });
        }
        if (eventName === 'done' && !hasDoneEvent) {
          hasDoneEvent = true;
          callbacks.onDone?.();
        }
      };

      const flushBuffer = (buffer: string) => {
        let hasReceivedEvent = false;
        const normalized = normalizeSSEText(buffer);
        const parts = normalized.split('\n\n');
        for (const segment of parts) {
          const parsed = parseSSESegment(segment);
          if (!parsed) continue;
          hasReceivedEvent = true;
          emitParsedEvent(parsed.event, parsed.data);
        }
        return hasReceivedEvent;
      };

      if (reader) {
        // 支持 ReadableStream 的环境（Web / 部分 RN）：流式读取
        const decoder = new TextDecoder();
        let buffer = '';
        let hasReceivedEvent = false;

        connectionTimeoutId = setTimeout(() => {
          if (hasReceivedEvent) return;
          controller.abort();
          callbacks.onError?.(new Error('连接超时，请确认后端已启动且 BASE_URL 配置正确（如真机需填本机局域网 IP）'));
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
        // React Native 等环境无 response.body：一次性读取再解析 SSE
        const fullText = await response.text();
        flushBuffer(fullText);
        if (!hasDoneEvent) callbacks.onDone?.();
      }
    } catch (error: any) {
      clearConnectionTimeout();
      if (error.name !== 'AbortError') {
        callbacks.onError?.(error);
      }
    }
  })();

  return controller;
}
