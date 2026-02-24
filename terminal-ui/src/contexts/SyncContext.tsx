/**
 * Sync 状态：与后端同步的会话与流式数据（对齐 opencode SyncProvider）
 * 将 useChat 迁入此层，App 与 MainContent 仅消费 useSync()。
 */
import React from 'react';
import { createSimpleContext } from './helper.js';
import { useChat } from '../useChat.js';
import type { StreamState } from '../types.js';

export interface SyncContextValue {
  streaming: boolean;
  streamState: StreamState;
  apiOutput: string | null;
  sendMessage: (message: string, mode: 'ask' | 'plan' | 'agent', agent: string) => void;
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
        apiOutput: value.apiOutput,
        sendMessage: value.sendMessage,
        setRESTOutput: value.setRESTOutput,
      }}
    >
      {children}
    </Context.Provider>
  );
}

export { useSync };
