import type { PausedTaskSnapshot } from '../../common/types';

export interface SlimTimelineItem {
  id?: string;
  type: string;
  title?: string;
  body?: string;
  tool?: string;
}

export interface ConversationTurnMeta {
  title?: string;
  paused?: PausedTaskSnapshot | null;
  timeline?: SlimTimelineItem[];
}

export function parseConversationMeta(raw?: string | null): ConversationTurnMeta {
  if (!raw?.trim()) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const obj = parsed as Record<string, unknown>;
    const title = typeof obj.title === 'string' ? obj.title.trim() : '';
    const timeline = Array.isArray(obj.timeline)
      ? (obj.timeline as SlimTimelineItem[]).slice(0, 40)
      : undefined;
    const paused =
      obj.paused && typeof obj.paused === 'object'
        ? (obj.paused as PausedTaskSnapshot)
        : obj.paused === null
          ? null
          : undefined;
    return {
      ...(title ? { title } : {}),
      ...(timeline ? { timeline } : {}),
      ...(paused !== undefined ? { paused } : {}),
    };
  } catch {
    return {};
  }
}

export function stringifyConversationMeta(meta: ConversationTurnMeta): string {
  return JSON.stringify({
    title: meta.title ?? '',
    paused: meta.paused ?? null,
    timeline: (meta.timeline ?? []).slice(0, 40),
  });
}
