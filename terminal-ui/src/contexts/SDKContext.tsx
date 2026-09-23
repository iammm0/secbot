import React, { createContext, useContext } from 'react';
import { getBaseUrl } from '../api/config.js';
import { connectSSE } from '../api/sse.js';
import type { SSECallbacks } from '../api/sse.js';

interface SDKContextValue {
  baseUrl: string;
  fetch: typeof globalThis.fetch;
  connectSSE: (path: string, body: Record<string, unknown>, callbacks: SSECallbacks) => AbortController;
}

const SDKContext = createContext<SDKContextValue | null>(null);

export function SDKProvider({ children }: { children: React.ReactNode }) {
  const value: SDKContextValue = {
    baseUrl: getBaseUrl(),
    fetch: globalThis.fetch,
    connectSSE,
  };
  return (
    <SDKContext.Provider value={value}>
      {children}
    </SDKContext.Provider>
  );
}

export function useSDK(): SDKContextValue {
  const ctx = useContext(SDKContext);
  if (!ctx) throw new Error('useSDK must be used within SDKProvider');
  return ctx;
}
