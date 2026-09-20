import { randomUUID } from 'node:crypto';

export type ConfirmAction = 'allow' | 'deny' | 'always_allow';

export type UserInputPayload = {
  selected?: string[];
  text?: string;
};

type PendingEntry = {
  sessionId: string;
  kind: 'confirm' | 'user_input';
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

const pending = new Map<string, PendingEntry>();

/** sessionId → tool names permanently allowed this session (always_allow) */
const sessionAlwaysAllow = new Map<string, Set<string>>();

const DEFAULT_TIMEOUT_MS = 30 * 60 * 1000;

export function createHumanRequest<T = unknown>(args: {
  sessionId: string;
  kind: 'confirm' | 'user_input';
  timeoutMs?: number;
}): { requestId: string; promise: Promise<T> } {
  const requestId = randomUUID();
  const timeoutMs = args.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  const promise = new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(requestId);
      reject(new Error('等待用户确认超时'));
    }, timeoutMs);

    pending.set(requestId, {
      sessionId: args.sessionId,
      kind: args.kind,
      resolve: (value) => {
        clearTimeout(timer);
        pending.delete(requestId);
        resolve(value as T);
      },
      reject: (err) => {
        clearTimeout(timer);
        pending.delete(requestId);
        reject(err);
      },
      timer,
    });
  });

  return { requestId, promise };
}

export function resolveConfirmRequest(
  requestId: string,
  action: ConfirmAction,
  sessionId?: string,
): boolean {
  const entry = pending.get(requestId);
  if (!entry || entry.kind !== 'confirm') return false;
  if (sessionId && entry.sessionId !== sessionId) return false;
  entry.resolve({ action });
  return true;
}

export function resolveUserInputRequest(
  requestId: string,
  payload: UserInputPayload,
  sessionId?: string,
): boolean {
  const entry = pending.get(requestId);
  if (!entry || entry.kind !== 'user_input') return false;
  if (sessionId && entry.sessionId !== sessionId) return false;
  entry.resolve(payload);
  return true;
}

export function rejectSessionHumanRequests(sessionId: string, reason = '任务已取消'): void {
  for (const [id, entry] of pending) {
    if (entry.sessionId !== sessionId) continue;
    entry.reject(new Error(reason));
    pending.delete(id);
  }
}

export function markAlwaysAllow(sessionId: string, tool: string): void {
  let set = sessionAlwaysAllow.get(sessionId);
  if (!set) {
    set = new Set();
    sessionAlwaysAllow.set(sessionId, set);
  }
  set.add(tool);
}

export function isAlwaysAllowed(sessionId: string, tool: string): boolean {
  return sessionAlwaysAllow.get(sessionId)?.has(tool) ?? false;
}

export function clearSessionAlwaysAllow(sessionId: string): void {
  sessionAlwaysAllow.delete(sessionId);
}
