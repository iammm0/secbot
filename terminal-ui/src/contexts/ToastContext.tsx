import React, { createContext, useContext, useState, useCallback, useRef } from 'react';

export type ToastVariant = 'success' | 'error' | 'warning' | 'info';

export interface ToastOptions {
  title?: string;
  message: string;
  variant?: ToastVariant;
  duration?: number;
}

interface ToastContextValue {
  currentToast: ToastOptions | null;
  show: (options: ToastOptions) => void;
  error: (err: unknown) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const DEFAULT_DURATION = 3000;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [currentToast, setCurrentToast] = useState<ToastOptions | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const show = useCallback((options: ToastOptions) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setCurrentToast({
      variant: 'info',
      duration: DEFAULT_DURATION,
      ...options,
    });
    const duration = options.duration ?? DEFAULT_DURATION;
    timerRef.current = setTimeout(() => {
      setCurrentToast(null);
      timerRef.current = null;
    }, duration);
  }, []);

  const error = useCallback((err: unknown) => {
    const message = err instanceof Error ? err.message : String(err);
    show({ message, variant: 'error' });
  }, [show]);

  return (
    <ToastContext.Provider value={{ currentToast, show, error }}>
      {children}
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}
