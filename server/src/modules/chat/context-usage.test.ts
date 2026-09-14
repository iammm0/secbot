import { describe, expect, it } from 'vitest';
import { ContextItem, ContextItemSource } from '../../common/types';
import { mergeUsageParts, partsFromContextItems, sumPartTokens, usagePart } from './context-usage';

function item(source: ContextItemSource, tokens: number): ContextItem {
  return {
    id: `${source}-${tokens}`,
    content: source,
    source,
    priority: 1,
    tokensEstimate: tokens,
    tags: [],
    ttl: 'session',
    createdAt: new Date(),
  };
}

describe('context usage parts', () => {
  it('groups assembler sources into Cursor-style buckets', () => {
    const parts = partsFromContextItems([
      item('user_pinned', 40),
      item('explore', 10),
      item('recent', 100),
      item('sqlite', 30),
      item('vector', 20),
    ]);
    expect(parts.map((part) => [part.id, part.tokens])).toEqual([
      ['pinned', 50],
      ['conversation', 100],
      ['history', 30],
      ['memory', 20],
    ]);
    expect(sumPartTokens(parts)).toBe(200);
  });

  it('merges extra system/tool buckets in stable order', () => {
    const parts = mergeUsageParts([
      usagePart('user', 12)!,
      usagePart('tools', 80)!,
      usagePart('system', 25)!,
      usagePart('tools', 5)!,
    ]);
    expect(parts.map((part) => part.id)).toEqual(['system', 'tools', 'user']);
    expect(parts.find((part) => part.id === 'tools')?.tokens).toBe(85);
  });
});
