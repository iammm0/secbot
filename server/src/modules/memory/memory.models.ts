import { randomUUID } from 'node:crypto';

export const MEMORY_TYPES = ['short_term', 'episodic', 'long_term'] as const;

export type MemoryType = (typeof MEMORY_TYPES)[number];

export interface MemoryItem {
  id: string;
  content: string;
  type: MemoryType;
  importance: number;
  created_at: string;
  metadata: Record<string, unknown>;
}

export interface VectorItem {
  id: string;
  content: string;
  vector: number[];
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface VectorSearchResult {
  item: VectorItem;
  similarity: number;
}

export interface MemoryStats {
  short_term_count: number;
  episodic_count: number;
  long_term_count: number;
}

export function createMemoryItem(params: {
  content: string;
  type: MemoryType;
  importance?: number;
  metadata?: Record<string, unknown>;
}): MemoryItem {
  return {
    id: randomUUID(),
    content: params.content,
    type: params.type,
    importance: clampImportance(params.importance ?? 0.5),
    created_at: new Date().toISOString(),
    metadata: params.metadata ?? {},
  };
}

export function clampImportance(value: number): number {
  if (Number.isNaN(value)) return 0.5;
  if (value < 0) return 0;
  if (value > 1) return 1;
  return value;
}

export function toMemoryType(value: string | undefined | null): MemoryType | null {
  if (!value) return null;
  const normalized = value.trim().toLowerCase();
  return (MEMORY_TYPES as readonly string[]).includes(normalized)
    ? (normalized as MemoryType)
    : null;
}

