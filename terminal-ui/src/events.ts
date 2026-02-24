/**
 * TUI 内事件总线 — 类型安全的应用内事件（对齐 opencode event.ts 与 UI-DESIGN-AND-INTERACTION 第九节）
 */

export type ToastVariant = 'info' | 'success' | 'warning' | 'error';

export interface ToastShowPayload {
  message: string;
  title?: string;
  variant?: ToastVariant;
  duration?: number;
}

export interface CommandExecutePayload {
  command: string;
}

/** 事件定义：名称 + 载荷类型 + 简单运行时校验 */
function defineEvent<T>(
  name: string,
  guard: (data: unknown) => data is T
): {
  type: string;
  guard: (data: unknown) => data is T;
  parse: (data: unknown) => T;
} {
  return {
    type: name,
    guard,
    parse: (data: unknown): T => {
      if (!guard(data)) throw new Error(`Invalid payload for ${name}`);
      return data;
    },
  };
}

const ToastShow = defineEvent<ToastShowPayload>(
  'tui.toast.show',
  (d): d is ToastShowPayload =>
    typeof d === 'object' && d !== null && 'message' in d && typeof (d as ToastShowPayload).message === 'string'
);

const CommandExecute = defineEvent<CommandExecutePayload>(
  'tui.command.execute',
  (d): d is CommandExecutePayload =>
    typeof d === 'object' && d !== null && 'command' in d && typeof (d as CommandExecutePayload).command === 'string'
);

export const TuiEvent = {
  ToastShow,
  CommandExecute,
} as const;

type Listener<T> = (payload: T) => void;
const listeners = new Map<string, Set<(payload: unknown) => void>>();

function on<T>(event: { type: string; parse: (d: unknown) => T }, fn: Listener<T>): () => void {
  const key = event.type;
  if (!listeners.has(key)) listeners.set(key, new Set());
  const wrapper = (payload: unknown) => {
    try {
      fn(event.parse(payload));
    } catch {
      // ignore invalid payload
    }
  };
  listeners.get(key)!.add(wrapper);
  return () => listeners.get(key)?.delete(wrapper);
}

function emit<T>(event: { type: string }, payload: T): void {
  const key = event.type;
  listeners.get(key)?.forEach((fn) => {
    try {
      fn(payload);
    } catch {
      // ignore
    }
  });
}

export const tuiEvents = {
  /** 类型安全订阅：tui.toast.show */
  onToastShow: (fn: Listener<ToastShowPayload>) => on(ToastShow, fn),
  /** 类型安全订阅：tui.command.execute */
  onCommandExecute: (fn: Listener<CommandExecutePayload>) => on(CommandExecute, fn),
  /** 显示 Toast */
  toastShow: (opts: ToastShowPayload) => emit(ToastShow, opts),
  /** 执行命令 */
  commandExecute: (command: string) => emit(CommandExecute, { command }),
};
