import React, { createContext, useContext, useCallback } from 'react';

type ExitFn = (code?: number) => void;

const ExitContext = createContext<ExitFn | null>(null);

export function ExitProvider({
  children,
  onExit,
}: {
  children: React.ReactNode;
  onExit: ExitFn;
}) {
  return (
    <ExitContext.Provider value={onExit}>
      {children}
    </ExitContext.Provider>
  );
}

export function useExit(): ExitFn {
  const exit = useContext(ExitContext);
  if (!exit) throw new Error('useExit must be used within ExitProvider');
  return exit;
}
