import React, { createContext, useContext, useCallback, useEffect, useState } from 'react';
import { Box } from 'ink';
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
  const stdout = typeof process !== 'undefined' ? process.stdout : undefined;
  const [size, setSize] = useState(() => {
    const stream = stdout as NodeJS.WriteStream & { columns?: number; rows?: number };
    return {
      columns: stream?.columns ?? 100,
      rows: stream?.rows ?? 32,
    };
  });

  useEffect(() => {
    const stream = stdout as NodeJS.WriteStream & {
      on?(event: 'resize', listener: () => void): void;
      off?(event: 'resize', listener: () => void): void;
      columns?: number;
      rows?: number;
    };
    if (!stream?.on) return;
    const onResize = () => {
      setSize({
        columns: stream.columns ?? 100,
        rows: stream.rows ?? 32,
      });
    };
    stream.on('resize', onResize);
    return () => {
      stream.off?.('resize', onResize);
    };
  }, [stdout]);

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
        <Box width={size.columns} height={size.rows}>
          <ExitAnimation
            onComplete={handleAnimationComplete}
            duration={animationDuration}
          />
        </Box>
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
