// ===================================================================
// 通用 API 请求 Hook
// ===================================================================

import { useState, useCallback } from 'react';

interface UseApiState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

export function useApi<T>() {
  const [state, setState] = useState<UseApiState<T>>({
    data: null,
    loading: false,
    error: null,
  });

  const execute = useCallback(async (apiCall: () => Promise<T>) => {
    setState({ data: null, loading: true, error: null });
    try {
      const data = await apiCall();
      setState({ data, loading: false, error: null });
      return data;
    } catch (err: any) {
      const errorMsg = err?.message || '请求失败';
      setState({ data: null, loading: false, error: errorMsg });
      throw err;
    }
  }, []);

  return { ...state, execute };
}
