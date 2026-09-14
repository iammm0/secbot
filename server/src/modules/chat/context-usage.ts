import type { ContextItem, ContextItemSource } from '../../common/types';

export const CONTEXT_PART_IDS = [
  'system',
  'tools',
  'skills',
  'mcp',
  'pinned',
  'conversation',
  'history',
  'memory',
  'user',
] as const;

export type ContextPartId = (typeof CONTEXT_PART_IDS)[number];

export interface ContextUsagePart {
  id: ContextPartId;
  label: string;
  tokens: number;
}

export const CONTEXT_PART_LABELS: Record<ContextPartId, string> = {
  system: '系统提示',
  tools: '工具定义',
  skills: 'Skills',
  mcp: 'MCP',
  pinned: '钉选事实',
  conversation: '近期对话',
  history: '历史摘要',
  memory: '向量记忆',
  user: '本轮输入',
};

const SOURCE_TO_PART: Record<ContextItemSource, ContextPartId> = {
  user_pinned: 'pinned',
  explore: 'pinned',
  recent: 'conversation',
  sqlite: 'history',
  vector: 'memory',
};

export function partLabel(id: ContextPartId): string {
  return CONTEXT_PART_LABELS[id];
}

export function usagePart(id: ContextPartId, tokens: number): ContextUsagePart | null {
  if (!Number.isFinite(tokens) || tokens <= 0) return null;
  return { id, label: partLabel(id), tokens: Math.round(tokens) };
}

export function partsFromContextItems(items: ContextItem[]): ContextUsagePart[] {
  const tally: Partial<Record<ContextPartId, number>> = {};
  for (const item of items) {
    const id = SOURCE_TO_PART[item.source] ?? 'memory';
    tally[id] = (tally[id] ?? 0) + Math.max(0, item.tokensEstimate);
  }
  return mergeUsageParts(
    CONTEXT_PART_IDS.map((id) => usagePart(id, tally[id] ?? 0)).filter(
      (part): part is ContextUsagePart => part != null,
    ),
  );
}

export function mergeUsageParts(parts: ContextUsagePart[]): ContextUsagePart[] {
  const tally = new Map<ContextPartId, number>();
  for (const part of parts) {
    if (!part || part.tokens <= 0) continue;
    tally.set(part.id, (tally.get(part.id) ?? 0) + part.tokens);
  }
  return CONTEXT_PART_IDS.flatMap((id) => {
    const tokens = tally.get(id) ?? 0;
    return tokens > 0 ? [{ id, label: partLabel(id), tokens: Math.round(tokens) }] : [];
  });
}

export function sumPartTokens(parts: ContextUsagePart[]): number {
  return parts.reduce((sum, part) => sum + part.tokens, 0);
}
