// ===================================================================
// SSE 流式请求 Hook
// ===================================================================

import { useState, useCallback, useRef } from 'react';
import { connectSSE } from '../api/sse';
import type { SSEEvent } from '../types';

export function useSSE() {
  const [streaming, setStreaming] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);

  const startStream = useCallback(
    (
      path: string,
      body: any,
      onEvent: (event: SSEEvent) => void,
      onDone?: () => void,
      onError?: (error: Error) => void,
    ) => {
      // 取消上一个流
      controllerRef.current?.abort();

      setStreaming(true);

      const controller = connectSSE(path, body, {
        onEvent,
        onDone: () => {
          setStreaming(false);
          onDone?.();
        },
        onError: (err) => {
          setStreaming(false);
          onError?.(err);
        },
      });

      controllerRef.current = controller;
      return controller;
    },
    [],
  );

  const stopStream = useCallback(() => {
    controllerRef.current?.abort();
    setStreaming(false);
  }, []);

  return { streaming, startStream, stopStream };
}
