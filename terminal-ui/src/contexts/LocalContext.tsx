/**
 * Local 状态：纯前端 UI 状态（mode、agent 等），与 opencode LocalProvider 对齐。
 */
import React, { useState, useCallback } from 'react';
import { createSimpleContext } from './helper.js';
import type { ChatMode } from '../types.js';

export interface LocalContextValue {
  mode: ChatMode;
  setMode: (m: ChatMode) => void;
  agent: string;
  setAgent: (a: string) => void;
}

const { Context, use: useLocal } = createSimpleContext<LocalContextValue>('Local');

const defaultMode: ChatMode = 'agent';
const defaultAgent = 'secbot-cli';

export function LocalProvider({ children }: { children: React.ReactNode }) {
  const [mode, setMode] = useState<ChatMode>(defaultMode);
  const [agent, setAgent] = useState<string>(defaultAgent);
  const value: LocalContextValue = {
    mode,
    setMode: useCallback((m: ChatMode) => setMode(m), []),
    agent,
    setAgent: useCallback((a: string) => setAgent(a), []),
  };
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export { useLocal };
