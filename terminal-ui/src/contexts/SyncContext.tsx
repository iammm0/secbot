/**
 * Sync 状态：与后端同步的会话与流式数据（对齐 opencode SyncProvider）
 * 将 useChat 迁入此层，App 与 MainContent 仅消费 useSync()。
 */
import React from 'react';
import { createSimpleContext } from './helper.js';
import { useChat } from '../useChat.js';
import type { StreamState } from '../types.js';
import type { PendingRootRequest } from '../useChat.js';

export interface SyncContextValue {
  streaming: boolean;
  streamState: StreamState;
  history: StreamState[];
  apiOutput: string | null;
  pendingRootRequest: PendingRootRequest | null;
  setPendingRootRequest: React.Dispatch<React.SetStateAction<PendingRootRequest | null>>;
  sendMessage: (message: string, mode: 'ask' | 'agent', agent: string) => void;
  setRESTOutput: (text: string | null) => void;
}

const { Context, use: useSync } = createSimpleContext<SyncContextValue>('Sync');

export function SyncProvider({ children }: { children: React.ReactNode }) {
  const value = useChat();
  return (
    <Context.Provider
      value={{
        streaming: value.streaming,
        streamState: value.streamState,
        history: value.history,
        apiOutput: value.apiOutput,
        pendingRootRequest: value.pendingRootRequest,
        setPendingRootRequest: value.setPendingRootRequest,
        sendMessage: value.sendMessage,
        setRESTOutput: value.setRESTOutput,
      }}
    >
      {children}
    </Context.Provider>
  );
}

export { useSync };
