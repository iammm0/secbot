import React, { createContext, useContext, useState, useCallback } from 'react';

export type RouteType = 'home' | 'session';

export interface Route {
  type: RouteType;
  sessionID?: string;
  /** 从首页带过去的初始输入，进入会话后可预填或直接发送 */
  initialPrompt?: string;
}

interface RouteContextValue {
  route: Route;
  navigate: (route: Route) => void;
}

const defaultRoute: Route = { type: 'home' };

const RouteContext = createContext<RouteContextValue | null>(null);

export function RouteProvider({ children }: { children: React.ReactNode }) {
  const [route, setRoute] = useState<Route>(defaultRoute);
  const navigate = useCallback((r: Route) => setRoute(r), []);
  return (
    <RouteContext.Provider value={{ route, navigate }}>
      {children}
    </RouteContext.Provider>
  );
}

export function useRoute(): RouteContextValue {
  const ctx = useContext(RouteContext);
  if (!ctx) throw new Error('useRoute must be used within RouteProvider');
  return ctx;
}
