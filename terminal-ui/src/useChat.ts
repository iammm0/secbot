/**
 * useChat — 核心聊天 Hook
 *
 * 修复说明：
 *  1. HistoryItem 错位 Bug 修复：原代码在 sendMessage 时将「新消息」与「上一轮响应」一起存入历史，
 *     导致显示时 userMessage 与 streamState 不匹配（msg2 配 response1）。
 *     修复方式：用 currentUserMessageRef 保存当前轮次用户消息，下一轮开始时推入历史。
 *  2. 时间戳：HistoryItem 新增 sentAt（发送时刻）与 completedAt（响应完成时刻）。
 *  3. currentUserMessage / currentSentAt / currentCompletedAt 暴露给外层，
 *     供 MainContent 在当前轮次渲染「用户消息气泡 + 完成时间」。
 *  4. Typewriter 效果：response 事件到达后，以 ~50 字符/帧（@16ms）逐步揭示，
 *     即便后端一次性返回全文，TUI 也能呈现流式打字感。
 */
import { useState, useCallback, useRef, useEffect } from "react";
import { connectSSE } from "./sse.js";
import type {
  ChatRequest,
  ChatMode,
  StreamState,
  SSEEvent,
  StreamTimelineItem,
} from "./types.js";

// ─── 初始状态 ──────────────────────────────────────────────────────────────────

const initialStreamState: StreamState = {
  phase: "",
  detail: "",
  planning: null,
  thought: null,
  thoughtChunks: new Map(),
  actions: [],
  content: "",
  report: "",
  error: null,
  response: null,
  timeline: [],
};

function resetStreamState(): StreamState {
  return {
    ...initialStreamState,
    thoughtChunks: new Map(),
    actions: [],
    timeline: [],
  };
}

// ─── 类型 ──────────────────────────────────────────────────────────────────────

export interface PendingRootRequest {
  requestId: string;
  command: string;
}

/** 已完成的一轮对话（用户消息 + 完整 Secbot 响应） */
export interface HistoryItem {
  /** 用户发送的消息文本 */
  userMessage: string;
  /** 用户发送时刻（Date.now()） */
  sentAt: number;
  /** Secbot 响应的完整流状态快照 */
  streamState: StreamState;
  /** 流式响应完成时刻（Date.now()），0 表示异常中断 */
  completedAt: number;
}

// ─── Typewriter 配置 ───────────────────────────────────────────────────────────

/** 每 16ms（≈60fps）揭示的字符数；越大打字越快 */
const TYPEWRITER_CHARS_PER_TICK = 50;

// ─── Hook ──────────────────────────────────────────────────────────────────────

export function useChat() {
  const [streaming, setStreaming] = useState(false);
  const [streamState, setStreamState] =
    useState<StreamState>(initialStreamState);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [apiOutput, setApiOutput] = useState<string | null>(null);
  const [pendingRootRequest, setPendingRootRequest] =
    useState<PendingRootRequest | null>(null);

  // 当前轮次的用户消息与发送时刻（供外层渲染"当前正在进行的轮次"）
  const [currentUserMessage, setCurrentUserMessage] = useState<string>("");
  const [currentSentAt, setCurrentSentAt] = useState<number>(0);
  // 当前轮次完成时刻（streaming 结束后更新）
  const [currentCompletedAt, setCurrentCompletedAt] = useState<number>(0);

  // 用于在异步回调中访问最新状态的 Ref
  const abortRef = useRef<AbortController | null>(null);
  const streamStateRef = useRef<StreamState>(initialStreamState);
  /** 当前轮次用户消息（异步 onDone/onError 回调中使用） */
  const currentUserMessageRef = useRef<string>("");
  /** 当前轮次发送时刻 */
  const currentSentAtRef = useRef<number>(0);
  /** 当前轮次完成时刻（onDone 写入，sendMessage 读取推历史） */
  const completedAtRef = useRef<number>(0);
  /** Typewriter 定时器，新消息到来时需要清理上一个 */
  const typewriterRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const thoughtSeqRef = useRef<number>(0);
  const activeThoughtIdByIterationRef = useRef<Map<number, string>>(new Map());

  useEffect(() => {
    streamStateRef.current = streamState;
  }, [streamState]);

  // ── 辅助 ─────────────────────────────────────────────────────────────────────

  const hasContent = useCallback((state: StreamState): boolean => {
    return Boolean(
      state.timeline.length > 0 ||
      state.phase ||
      state.detail ||
      state.planning ||
      state.thought ||
      state.actions.length > 0 ||
      state.content ||
      state.report ||
      state.error ||
      state.response,
    );
  }, []);

  const upsertTimelineItem = useCallback(
    (
      timeline: StreamTimelineItem[],
      id: string,
      build: (prev?: StreamTimelineItem) => StreamTimelineItem,
    ) => {
      const idx = timeline.findIndex((item) => item.id === id);
      if (idx === -1) return [...timeline, build(undefined)];
      const next = [...timeline];
      next[idx] = build(next[idx]);
      return next;
    },
    [],
  );

  const appendContent = useCallback((text: string) => {
    setStreamState((s) => ({
      ...s,
      content: s.content ? `${s.content}\n\n${text}` : text,
    }));
  }, []);

  /** 清理 typewriter 定时器 */
  const clearTypewriter = useCallback(() => {
    if (typewriterRef.current !== null) {
      clearInterval(typewriterRef.current);
      typewriterRef.current = null;
    }
  }, []);

  /**
   * Typewriter 动画：将 fullText 以每 16ms TYPEWRITER_CHARS_PER_TICK 个字符逐步揭示到
   * streamState.response，给非流式 API 响应带来打字机视觉效果。
   */
  const startTypewriter = useCallback(
    (fullText: string) => {
      clearTypewriter();
      let revealed = 0;
      typewriterRef.current = setInterval(() => {
        revealed = Math.min(
          revealed + TYPEWRITER_CHARS_PER_TICK,
          fullText.length,
        );
        setStreamState((s) => ({
          ...s,
          response: fullText.slice(0, revealed),
          timeline: upsertTimelineItem(s.timeline, "final-summary", (prev) => ({
            ...prev,
            id: "final-summary",
            type: "final",
            title: "最终总结",
            body: fullText.slice(0, revealed),
            status: revealed >= fullText.length ? "done" : "running",
          })),
        }));
        if (revealed >= fullText.length) {
          clearTypewriter();
        }
      }, 16);
    },
    [clearTypewriter, upsertTimelineItem],
  );

  // ── 发送消息 ──────────────────────────────────────────────────────────────────

  const sendMessage = useCallback(
    (message: string, mode: ChatMode = "agent", agent: string = "secbot-cli") => {
      // 取消正在进行的请求与 typewriter
      abortRef.current?.abort();
      clearTypewriter();

      // ── 将上一轮已完成的对话推入历史 ──────────────────────────────────────────
      // 使用 currentUserMessageRef（上一条用户消息）而不是 message（新消息），
      // 修复原有的「userMessage 与 streamState 错位」bug。
      const prev = streamStateRef.current;
      if (hasContent(prev) && currentUserMessageRef.current) {
        const historyItem: HistoryItem = {
          userMessage: currentUserMessageRef.current,
          sentAt: currentSentAtRef.current,
          streamState: prev,
          completedAt: completedAtRef.current,
        };
        setHistory((h) => [...h, historyItem]);
      }

      // ── 初始化当前轮次 ─────────────────────────────────────────────────────────
      const now = Date.now();
      currentUserMessageRef.current = message;
      currentSentAtRef.current = now;
      completedAtRef.current = 0;
      thoughtSeqRef.current = 0;
      activeThoughtIdByIterationRef.current = new Map();

      setCurrentUserMessage(message);
      setCurrentSentAt(now);
      setCurrentCompletedAt(0);
      setStreamState(resetStreamState());
      setApiOutput(null);
      setStreaming(true);

      // ── 建立 SSE 连接 ─────────────────────────────────────────────────────────
      const controller = connectSSE(
        "/api/chat",
        { message, mode, agent } as Record<string, unknown>,
        {
          onEvent(ev: SSEEvent) {
            let { event, data } = ev;
            // 兼容旧/异构后端命名，统一映射到 thought 事件链路。
            if (event === "reasoning_start") event = "thought_start";
            else if (event === "reasoning_chunk") event = "thought_chunk";
            else if (event === "reasoning") event = "thought";
            switch (event) {
              case "connected":
                break;

              case "planning":
                setStreamState((s) => ({
                  ...s,
                  planning: {
                    content: (data.content as string) ?? "",
                    todos:
                      (data.todos as Array<{
                        content: string;
                        status?: string;
                      }>) ?? [],
                  },
                }));
                break;

              case "thought_start":
                setStreamState((s) => ({
                  ...(function () {
                    const it = (data.iteration as number) ?? 1;
                    thoughtSeqRef.current += 1;
                    const thoughtId = `thought-${it}-${thoughtSeqRef.current}`;
                    activeThoughtIdByIterationRef.current.set(it, thoughtId);
                    const nextThoughtChunks = new Map(s.thoughtChunks);
                    // 新一轮相同 iteration 的推理开始时，重置该 iteration 的分片缓存，避免串台
                    nextThoughtChunks.set(it, "");
                    return {
                      ...s,
                      thought: {
                        iteration: it,
                        content: "",
                      },
                      thoughtChunks: nextThoughtChunks,
                      timeline: [...s.timeline, {
                        id: thoughtId,
                        type: "thought",
                        title: "推理",
                        body: "",
                        iteration: it,
                        status: "running",
                      }],
                    };
                  })(),
                }));
                break;

              case "thought_chunk": {
                const it = (data.iteration as number) ?? 1;
                const chunk = (data.chunk as string) ?? "";
                const thoughtId =
                  activeThoughtIdByIterationRef.current.get(it) ?? `thought-${it}`;
                setStreamState((s) => {
                  const next = new Map(s.thoughtChunks);
                  next.set(it, (next.get(it) ?? "") + chunk);
                  const thoughtBody = next.get(it) ?? "";
                  return {
                    ...s,
                    thoughtChunks: next,
                    timeline: upsertTimelineItem(
                      s.timeline,
                      thoughtId,
                      (prev) => ({
                        id: thoughtId,
                        type: "thought",
                        title: "推理",
                        body: thoughtBody,
                        iteration: it,
                        status: prev?.status ?? "running",
                      }),
                    ),
                  };
                });
                break;
              }

              case "thought": {
                const tIt = (data.iteration as number) ?? 1;
                const tId =
                  activeThoughtIdByIterationRef.current.get(tIt) ??
                  `thought-${tIt}`;
                setStreamState((s) => {
                  const existing = s.timeline.find((t) => t.id === tId);
                  if (existing?.status === "done") return s;
                  return {
                    ...s,
                    thought: {
                      iteration: tIt,
                      content: (data.content as string) ?? "",
                    },
                    timeline: upsertTimelineItem(
                      s.timeline,
                      tId,
                      (prev) => ({
                        id: tId,
                        type: "thought",
                        title: "推理",
                        body:
                          (data.content as string) ??
                          prev?.body ??
                          s.thoughtChunks.get(tIt) ??
                          "",
                        iteration: tIt,
                        status: "done",
                      }),
                    ),
                  };
                });
                activeThoughtIdByIterationRef.current.delete(tIt);
                break;
              }

              case "action_start":
                setStreamState((s) => ({
                  ...s,
                  actions: [
                    ...s.actions,
                    {
                      tool: (data.tool as string) ?? "",
                      params: (data.params as Record<string, unknown>) ?? {},
                      viewType: ((data.view_type as string) ?? "raw") as
                        | "raw"
                        | "summary",
                    },
                  ],
                  timeline: [
                    ...s.timeline,
                    {
                      id: `action-${s.actions.length}-${(data.tool as string) ?? "tool"}`,
                      type: "action",
                      title: `工具调用 · ${(data.tool as string) ?? "unknown"}`,
                      body: `状态: 执行中`,
                      tool: (data.tool as string) ?? "",
                      status: "running",
                    },
                  ],
                }));
                break;

              case "action_result": {
                const toolName = (data.tool as string) ?? "";
                setStreamState((s) => {
                  const actions = [...s.actions];
                  const idx = actions.findIndex(
                    (a) => a.tool === toolName && a.result === undefined,
                  );
                  if (idx >= 0) {
                    actions[idx] = {
                      ...actions[idx],
                      success: data.success as boolean,
                      result: data.result,
                      error: data.error as string,
                      viewType: ((data.view_type as string) ?? "raw") as
                        | "raw"
                        | "summary",
                    };
                  } else {
                    actions.push({
                      tool: toolName,
                      params: {},
                      success: data.success as boolean,
                      result: data.result,
                      error: data.error as string,
                      viewType: ((data.view_type as string) ?? "raw") as
                        | "raw"
                        | "summary",
                    });
                  }
                  const timeline = [...s.timeline];
                  const timelineIdx = [...timeline]
                    .reverse()
                    .findIndex(
                      (item) =>
                        item.type === "action" &&
                        item.tool === toolName &&
                        item.status !== "done",
                    );
                  if (timelineIdx >= 0) {
                    const realIdx = timeline.length - 1 - timelineIdx;
                    const ok = Boolean(data.success);
                    const line = `状态: ${ok ? "完成" : "失败"}${
                      data.error ? `\n错误: ${String(data.error)}` : ""
                    }`;
                    timeline[realIdx] = {
                      ...timeline[realIdx],
                      body: line,
                      success: ok,
                      error:
                        data.error !== undefined ? String(data.error) : undefined,
                      result: data.result,
                      status: "done",
                    };
                  }
                  return { ...s, actions, timeline };
                });
                break;
              }

              case "content": {
                if (((data.view_type as string) ?? "summary") !== "raw") {
                  const obs = (data.content as string) ?? "";
                  const obsTool = (data.tool as string) ?? "";
                  const obsIteration = (data.iteration as number) ?? 0;
                  const obsTitle = obsTool
                    ? `观察 · ${obsTool}${obsIteration ? ` #${obsIteration}` : ""}`
                    : "总结观察";
                  appendContent(obs);
                  setStreamState((s) => ({
                    ...s,
                    timeline: [
                      ...s.timeline,
                      {
                        id: `observation-${s.timeline.length}`,
                        type: "observation",
                        title: obsTitle,
                        body: obs,
                        tool: obsTool || undefined,
                        iteration: obsIteration || undefined,
                        status: "done",
                      },
                    ],
                  }));
                }
                break;
              }

              case "report":
                setStreamState((s) => ({
                  ...s,
                  report: (data.content as string) ?? "",
                }));
                break;

              case "phase":
                setStreamState((s) => ({
                  ...s,
                  phase: (data.phase as string) ?? "",
                  detail: (data.detail as string) ?? "",
                }));
                break;

              case "root_required":
                setPendingRootRequest({
                  requestId: (data.request_id as string) ?? "",
                  command: (data.command as string) ?? "",
                });
                break;

              case "error":
                setStreamState((s) => ({
                  ...s,
                  error: (data.error as string) ?? "Unknown error",
                }));
                break;

              case "response": {
                // Typewriter 效果：即使 API 一次性返回全文，也逐步揭示
                const fullText = (data.content as string) ?? null;
                if (fullText) {
                  setStreamState((s) => ({
                    ...s,
                    timeline: upsertTimelineItem(s.timeline, "final-summary", () => ({
                      id: "final-summary",
                      type: "final",
                      title: "最终总结",
                      body: "",
                      status: "running",
                    })),
                  }));
                  startTypewriter(fullText);
                }
                break;
              }

              case "done":
                break;

              default:
                break;
            }
          },

          onDone: () => {
            // 确保 typewriter 先完成（若已完成则立即结束；否则等 typewriter 自然结束后 streaming 仍为 true）
            // 这里的策略：onDone 标记 completedAt 并立即停止 streaming，
            // typewriter 会在下一次 setInterval tick 中继续揭示剩余字符但 streaming=false 时
            // ResponseBlock 仍可继续渲染（它不依赖 streaming flag）。
            const doneAt = Date.now();
            completedAtRef.current = doneAt;
            setCurrentCompletedAt(doneAt);
            setStreaming(false);
          },

          onError: (err) => {
            clearTypewriter();
            setStreamState((s) => ({ ...s, error: err.message }));
            completedAtRef.current = Date.now();
            setCurrentCompletedAt(Date.now());
            setStreaming(false);
          },
        },
      );

      abortRef.current = controller;
    },
    [appendContent, clearTypewriter, startTypewriter, hasContent, upsertTimelineItem],
  );

  // ── 其他操作 ──────────────────────────────────────────────────────────────────

  const stopStream = useCallback(() => {
    abortRef.current?.abort();
    clearTypewriter();
    setStreaming(false);
  }, [clearTypewriter]);

  const setRESTOutput = useCallback((text: string | null) => {
    setApiOutput(text);
  }, []);

  // ── 清理 ──────────────────────────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      clearTypewriter();
    };
  }, [clearTypewriter]);

  return {
    streaming,
    streamState,
    history,
    /** 当前正在进行（或刚完成）的轮次：用户消息文本 */
    currentUserMessage,
    /** 当前轮次用户消息的发送时刻 */
    currentSentAt,
    /** 当前轮次 Secbot 响应的完成时刻（0 = 尚未完成） */
    currentCompletedAt,
    apiOutput,
    pendingRootRequest,
    setPendingRootRequest,
    sendMessage,
    stopStream,
    setRESTOutput,
  };
}
