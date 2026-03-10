import { useState, useCallback, useRef, useEffect } from 'react';
import { connectSSE } from './sse.js';
import type { ChatRequest, ChatMode, StreamState, SSEEvent } from './types.js';

const initialStreamState: StreamState = {
  phase: '',
  detail: '',
  planning: null,
  thought: null,
  thoughtChunks: new Map(),
  actions: [],
  content: '',
  report: '',
  error: null,
  response: null,
};

export interface PendingRootRequest {
  requestId: string;
  command: string;
}

function resetStreamState(): StreamState {
  return {
    ...initialStreamState,
    thoughtChunks: new Map(),
    actions: [],
  };
}

export function useChat() {
  const [streaming, setStreaming] = useState(false);
  const [streamState, setStreamState] = useState<StreamState>(initialStreamState);
  const [history, setHistory] = useState<StreamState[]>([]);
  const [apiOutput, setApiOutput] = useState<string | null>(null);
  const [pendingRootRequest, setPendingRootRequest] = useState<PendingRootRequest | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const streamStateRef = useRef<StreamState>(initialStreamState);

  useEffect(() => {
    streamStateRef.current = streamState;
  }, [streamState]);

  const hasContent = useCallback((state: StreamState): boolean => {
    return Boolean(
      state.phase ||
        state.detail ||
        state.planning ||
        state.thought ||
        state.actions.length > 0 ||
        state.content ||
        state.report ||
        state.error ||
        state.response
    );
  }, []);

  const appendContent = useCallback((text: string) => {
    setStreamState((s) => ({ ...s, content: s.content + text }));
  }, []);

  const sendMessage = useCallback(
    (message: string, mode: ChatMode = 'agent', agent: string = 'hackbot') => {
      abortRef.current?.abort();
       // 在开始新一轮对话前，将上一轮非空流状态快照到本地历史，便于在 TUI 中滚动查看完整上下文
      const prev = streamStateRef.current;
      if (hasContent(prev)) {
        setHistory((h) => [...h, prev]);
      }
      setStreamState(resetStreamState());
      setApiOutput(null);
      setStreaming(true);

      const controller = connectSSE(
        '/api/chat',
        { message, mode, agent } as Record<string, unknown>,
        {
          onEvent(ev: SSEEvent) {
            const { event, data } = ev;
            switch (event) {
              case 'connected':
                break;
              case 'planning':
                setStreamState((s) => ({
                  ...s,
                  planning: {
                    content: (data.content as string) ?? '',
                    todos: (data.todos as Array<{ content: string; status?: string }>) ?? [],
                  },
                }));
                break;
              case 'thought_start':
                setStreamState((s) => ({
                  ...s,
                  thought: { iteration: (data.iteration as number) ?? 1, content: '' },
                  thoughtChunks: new Map(s.thoughtChunks),
                }));
                break;
              case 'thought_chunk': {
                const it = (data.iteration as number) ?? 1;
                const chunk = (data.chunk as string) ?? '';
                setStreamState((s) => {
                  const next = new Map(s.thoughtChunks);
                  next.set(it, (next.get(it) ?? '') + chunk);
                  return { ...s, thoughtChunks: next };
                });
                break;
              }
              case 'thought':
                setStreamState((s) => ({
                  ...s,
                  thought: {
                    iteration: (data.iteration as number) ?? 1,
                    content: (data.content as string) ?? '',
                  },
                }));
                break;
              case 'action_start':
                setStreamState((s) => ({
                  ...s,
                  actions: [
                    ...s.actions,
                    {
                      tool: (data.tool as string) ?? '',
                      params: (data.params as Record<string, unknown>) ?? {},
                    },
                  ],
                }));
                break;
              case 'action_result': {
                const last = (data.tool as string) ?? '';
                setStreamState((s) => {
                  const actions = [...s.actions];
                  const idx = actions.findIndex((a) => a.tool === last && a.result === undefined);
                  if (idx >= 0) {
                    actions[idx] = {
                      ...actions[idx],
                      success: data.success as boolean,
                      result: data.result,
                      error: data.error as string,
                    };
                  } else {
                    actions.push({
                      tool: last,
                      params: {},
                      success: data.success as boolean,
                      result: data.result,
                      error: data.error as string,
                    });
                  }
                  return { ...s, actions };
                });
                break;
              }
              case 'content':
                appendContent((data.content as string) ?? '');
                break;
              case 'report':
                setStreamState((s) => ({ ...s, report: (data.content as string) ?? '' }));
                break;
              case 'phase':
                setStreamState((s) => ({
                  ...s,
                  phase: (data.phase as string) ?? '',
                  detail: (data.detail as string) ?? '',
                }));
                break;
              case 'root_required':
                setPendingRootRequest({
                  requestId: (data.request_id as string) ?? '',
                  command: (data.command as string) ?? '',
                });
                break;
              case 'error':
                setStreamState((s) => ({ ...s, error: (data.error as string) ?? 'Unknown error' }));
                break;
              case 'response':
                setStreamState((s) => ({ ...s, response: (data.content as string) ?? null }));
                break;
              case 'done':
                break;
              default:
                break;
            }
          },
          onDone: () => setStreaming(false),
          onError: (err) => {
            setStreamState((s) => ({ ...s, error: err.message }));
            setStreaming(false);
          },
        }
      );
      abortRef.current = controller;
    },
    [appendContent]
  );

  const stopStream = useCallback(() => {
    abortRef.current?.abort();
    setStreaming(false);
  }, []);

  const setRESTOutput = useCallback((text: string | null) => {
    setApiOutput(text);
  }, []);

  return {
    streaming,
    streamState,
    history,
    apiOutput,
    pendingRootRequest,
    setPendingRootRequest,
    sendMessage,
    stopStream,
    setRESTOutput,
  };
}
