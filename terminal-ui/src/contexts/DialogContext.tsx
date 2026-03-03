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
    // #region agent log
    setStack((prev) => {
      const lenBefore = prev.length;
      if (typeof fetch !== 'undefined') fetch('http://127.0.0.1:7331/ingest/20b0ff39-6b05-4e73-951e-46c45fc901e8',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'56b7f1'},body:JSON.stringify({sessionId:'56b7f1',location:'DialogContext:pop',message:'pop called',data:{stackLenBefore:lenBefore},timestamp:Date.now(),hypothesisId:'H2',runId:'pop'})}).catch(()=>{});
      // #endregion
      if (prev.length === 0) return prev;
      const top = prev[prev.length - 1];
      top?.onClose?.();
      return prev.slice(0, -1);
    });
  }, []);

  const clear = useCallback(() => {
    // #region agent log
    setStack((prev) => {
      const lenBefore = prev.length;
      if (typeof fetch !== 'undefined') fetch('http://127.0.0.1:7331/ingest/20b0ff39-6b05-4e73-951e-46c45fc901e8',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'56b7f1'},body:JSON.stringify({sessionId:'56b7f1',location:'DialogContext:clear',message:'clear called',data:{stackLenBefore:lenBefore},timestamp:Date.now(),hypothesisId:'H3',runId:'clear'})}).catch(()=>{});
      // #endregion
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
