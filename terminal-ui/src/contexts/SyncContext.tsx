/**
 * Sync 状态：与后端同步的会话与流式数据（对齐 opencode SyncProvider）
 * 将 useChat 迁入此层，App 与 MainContent 仅消费 useSync()。
 *
 * 更新说明：
 *  - 新增 currentUserMessage：当前正在进行轮次的用户消息文本
 *  - 新增 currentSentAt：当前轮次用户消息的发送时刻
 *  - 新增 currentCompletedAt：当前轮次 Secbot 响应的完成时刻（0 = 尚未完成）
 */
import React from "react";
import { createSimpleContext } from "./helper.js";
import { useChat } from "../useChat.js";
import type { StreamState, ChatMode } from "../types.js";
import type {
  PendingRootRequest,
  HistoryItem,
  SessionListEntry,
} from "../useChat.js";

export interface SyncContextValue {
  streaming: boolean;
  streamState: StreamState;
  history: HistoryItem[];
  /** 当前正在进行（或刚完成）的轮次：用户消息文本 */
  currentUserMessage: string;
  /** 当前轮次用户消息的发送时刻（Date.now()），0 表示尚未开始 */
  currentSentAt: number;
  /** 当前轮次 Secbot 响应的完成时刻（Date.now()），0 表示尚未完成 */
  currentCompletedAt: number;
  /** 当前轮次请求使用的模式（ask 下去重展示等） */
  currentRoundChatMode: ChatMode;
  apiOutput: string | null;
  pendingRootRequest: PendingRootRequest | null;
  setPendingRootRequest: React.Dispatch<
    React.SetStateAction<PendingRootRequest | null>
  >;
  sendMessage: (message: string, mode: "ask" | "agent", agent: string) => void;
  setRESTOutput: (text: string | null) => void;
  activeSessionId: string;
  sessionList: SessionListEntry[];
  switchSession: (sessionId: string) => void;
  newSession: () => void;
}

const { Context, use: useSync } = createSimpleContext<SyncContextValue>("Sync");

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const value = useChat();
  return (
    <Context.Provider
      value={{
        streaming: value.streaming,
        streamState: value.streamState,
        history: value.history,
        currentUserMessage: value.currentUserMessage,
        currentSentAt: value.currentSentAt,
        currentCompletedAt: value.currentCompletedAt,
        currentRoundChatMode: value.currentRoundChatMode,
        apiOutput: value.apiOutput,
        pendingRootRequest: value.pendingRootRequest,
        setPendingRootRequest: value.setPendingRootRequest,
        sendMessage: value.sendMessage,
        setRESTOutput: value.setRESTOutput,
        activeSessionId: value.activeSessionId,
        sessionList: value.sessionList,
        switchSession: value.switchSession,
        newSession: value.newSession,
      }}
    >
      {children}
    </Context.Provider>
  );
}

export { useSync };
