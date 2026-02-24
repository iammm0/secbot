import React, { createContext, useContext, useState, useCallback } from 'react';

interface DialogStackItem {
  element: React.ReactNode;
  onClose?: () => void;
}

interface DialogContextValue {
  stack: DialogStackItem[];
  replace: (element: React.ReactNode, onClose?: () => void) => void;
  /** 弹栈：关闭顶层对话框并调用其 onClose（Escape/Ctrl+C 时调用） */
  pop: () => void;
  /** 关闭栈中所有对话框并清空 */
  clear: () => void;
}

const DialogContext = createContext<DialogContextValue | null>(null);

export function DialogProvider({ children }: { children: React.ReactNode }) {
  const [stack, setStack] = useState<DialogStackItem[]>([]);

  const replace = useCallback((element: React.ReactNode, onClose?: () => void) => {
    setStack([{ element, onClose }]);
  }, []);

  const pop = useCallback(() => {
    setStack((prev) => {
      if (prev.length === 0) return prev;
      const top = prev[prev.length - 1];
      top?.onClose?.();
      return prev.slice(0, -1);
    });
  }, []);

  const clear = useCallback(() => {
    setStack((prev) => {
      const top = prev[prev.length - 1];
      top?.onClose?.();
      return [];
    });
  }, []);

  return (
    <DialogContext.Provider value={{ stack, replace, pop, clear }}>
      {children}
    </DialogContext.Provider>
  );
}

export function useDialog(): DialogContextValue {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error('useDialog must be used within DialogProvider');
  return ctx;
}
