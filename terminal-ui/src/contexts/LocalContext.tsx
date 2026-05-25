/**
 * Local 状态：纯前端 UI 状态（agent 等），与 opencode LocalProvider 对齐。
 */
import React, { useState, useCallback } from 'react';
import { createSimpleContext } from './helper.js';

export interface LocalContextValue {
  agent: string;
  setAgent: (a: string) => void;
}

const { Context, use: useLocal } = createSimpleContext<LocalContextValue>('Local');

const defaultAgent = 'secbot-cli';

export function LocalProvider({ children }: { children: React.ReactNode }) {
  const [agent, setAgent] = useState<string>(defaultAgent);
  const value: LocalContextValue = {
    agent,
    setAgent: useCallback((a: string) => setAgent(a), []),
  };
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export { useLocal };
