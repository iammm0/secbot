import React, { createContext, useContext, useCallback, useState } from 'react';
import { ExitAnimation } from '../components/ExitAnimation.js';

type ExitFn = (code?: number) => void;

interface ExitContextValue {
  /** 触发退出 */
  exit: ExitFn;
  /** 是否正在显示退出动画 */
  isExiting: boolean;
}

const ExitContext = createContext<ExitContextValue | null>(null);

interface ExitProviderProps {
  children: React.ReactNode;
  onExit: ExitFn;
  /** 是否启用退出动画 */
  enableAnimation?: boolean;
  /** 动画持续时间（毫秒） */
  animationDuration?: number;
}

export function ExitProvider({
  children,
  onExit,
  enableAnimation = true,
  animationDuration = 1500,
}: ExitProviderProps) {
  const [isExiting, setIsExiting] = useState(false);
  const [exitCode, setExitCode] = useState<number>(0);

  const exit = useCallback((code?: number) => {
    if (enableAnimation) {
      setExitCode(code ?? 0);
      setIsExiting(true);
    } else {
      onExit(code ?? 0);
    }
  }, [enableAnimation, onExit]);

  const handleAnimationComplete = useCallback(() => {
    onExit(exitCode);
  }, [onExit, exitCode]);

  return (
    <ExitContext.Provider value={{ exit, isExiting }}>
      {isExiting ? (
        <ExitAnimation
          onComplete={handleAnimationComplete}
          duration={animationDuration}
        />
      ) : (
        children
      )}
    </ExitContext.Provider>
  );
}

export function useExit(): ExitFn {
  const ctx = useContext(ExitContext);
  if (!ctx) throw new Error('useExit must be used within ExitProvider');
  return ctx.exit;
}

export function useIsExiting(): boolean {
  const ctx = useContext(ExitContext);
  if (!ctx) throw new Error('useIsExiting must be used within ExitProvider');
  return ctx.isExiting;
}
