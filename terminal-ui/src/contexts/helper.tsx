/**
 * React 版 createSimpleContext：统一 Context 创建与报错信息（对齐 opencode context/helper）
 */
import React, { createContext, useContext, type ReactNode } from 'react';

export function createSimpleContext<T>(name: string): {
  Context: React.Context<T | null>;
  use: () => T;
} {
  const Context = createContext<T | null>(null);
  return {
    Context,
    use: () => {
      const value = useContext(Context);
      if (value == null) {
        throw new Error(`${name} must be used within its provider`);
      }
      return value;
    },
  };
}
