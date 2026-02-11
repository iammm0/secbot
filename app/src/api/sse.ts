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
      if (!reader) {
        throw new Error('ReadableStream 不可用');
      }

      const decoder = new TextDecoder();
      let buffer = '';
      let hasReceivedEvent = false;

      // 若迟迟收不到第一个事件则视为连接超时（后端未发首包或网络问题）
      connectionTimeoutId = setTimeout(() => {
        if (hasReceivedEvent) return;
        controller.abort();
        callbacks.onError?.(new Error('连接超时，请确认后端已启动且 BASE_URL 配置正确（如真机需填本机局域网 IP）'));
      }, CONNECTION_TIMEOUT_MS);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // 按双换行切分，保留最后一个可能不完整的段落
        const parts = buffer.split('\n\n');
        buffer = parts.pop() ?? '';

        for (const segment of parts) {
          const parsed = parseSSESegment(segment);
          if (!parsed) continue;

          hasReceivedEvent = true;
          clearConnectionTimeout();

          try {
            const parsedData = JSON.parse(parsed.data);
            callbacks.onEvent({
              event: parsed.event,
              data: parsedData,
            });
            if (parsed.event === 'done') {
              callbacks.onDone?.();
            }
          } catch {
            callbacks.onEvent({
              event: parsed.event,
              data: { raw: parsed.data },
            });
          }
        }
      }

      // 剩余 buffer 可能还有最后一个事件（无末尾 \n\n）
      if (buffer.trim()) {
        const parsed = parseSSESegment(buffer);
        if (parsed) {
          try {
            const parsedData = JSON.parse(parsed.data);
            callbacks.onEvent({ event: parsed.event, data: parsedData });
          } catch {
            callbacks.onEvent({ event: parsed.event, data: { raw: parsed.data } });
          }
        }
      }

      clearConnectionTimeout();
      callbacks.onDone?.();
    } catch (error: any) {
      clearConnectionTimeout();
      if (error.name !== 'AbortError') {
        callbacks.onError?.(error);
      }
    }
  })();

  return controller;
}
