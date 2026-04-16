/**
 * useMouseScroll — React Hook，消费 mouseFilter emitter 的滚轮事件
 */
import { useEffect } from "react";
import type { EventEmitter } from "node:events";

interface UseMouseScrollOptions {
  /** mouseFilter 的 emitter 实例 */
  emitter: EventEmitter | null;
  /** 是否启用（弹窗打开时可禁用） */
  enabled?: boolean;
  /** 每次滚轮滚动的行数 */
  scrollStep?: number;
  onScrollUp: (lines: number) => void;
  onScrollDown: (lines: number) => void;
}

export function useMouseScroll({
  emitter,
  enabled = true,
  scrollStep = 3,
  onScrollUp,
  onScrollDown,
}: UseMouseScrollOptions) {
  useEffect(() => {
    if (!enabled || !emitter) return;

    const handler = (direction: string) => {
      if (direction === "up") onScrollUp(scrollStep);
      else if (direction === "down") onScrollDown(scrollStep);
    };

    emitter.on("scroll", handler);
    return () => {
      emitter.removeListener("scroll", handler);
    };
  }, [emitter, enabled, scrollStep, onScrollUp, onScrollDown]);
}
