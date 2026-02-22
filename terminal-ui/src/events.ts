/**
 * TUI 内事件总线 — 类型安全的应用内事件（对齐 UI-DESIGN-AND-INTERACTION 第九节）
 */
type Listener = (...args: unknown[]) => void;

const listeners: Map<string, Set<Listener>> = new Map();

function on(event: string, fn: Listener): () => void {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event)!.add(fn);
  return () => listeners.get(event)?.delete(fn);
}

function emit(event: string, ...args: unknown[]): void {
  listeners.get(event)?.forEach((fn) => { try { fn(...args); } catch { /* ignore */ } });
}

export const tuiEvents = {
  on,
  emit,
  /** 显示 Toast */
  toastShow: (opts: { title?: string; message: string; variant?: string }) => emit('tui.toast.show', opts),
  /** 执行命令 */
  commandExecute: (command: string) => emit('tui.command.execute', command),
};
