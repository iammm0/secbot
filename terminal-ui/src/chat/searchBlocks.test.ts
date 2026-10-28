import { describe, expect, it } from 'vitest';
import type { ContentBlock } from './types.js';
import {
  findMatches,
  injectBodyHighlight,
  injectHighlight,
  matchAbsLine,
  type SearchMatch,
  SEARCH_HL_OFF,
  SEARCH_HL_ON,
} from './searchBlocks.js';
import { renderMarkdown } from '../render/renderMarkdown.js';

function makeBlock(overrides: Partial<ContentBlock>): ContentBlock {
  return {
    id: 'b1',
    type: 'content',
    body: '',
    lineStart: 0,
    lineEnd: 0,
    ...overrides,
  };
}

function makeMatch(overrides: Partial<SearchMatch>): SearchMatch {
  return {
    blockId: 'b1',
    inTitle: false,
    relLine: 0,
    colStart: 0,
    colEnd: 1,
    ...overrides,
  };
}

describe('findMatches', () => {
  it('returns [] for empty or whitespace query', () => {
    const blocks = [makeBlock({ body: 'hello world' })];
    expect(findMatches(blocks, '')).toEqual([]);
    expect(findMatches(blocks, '   ')).toEqual([]);
  });

  it('matches case-insensitively in body', () => {
    const blocks = [makeBlock({ body: 'nmap found OPEN port' })];
    const matches = findMatches(blocks, 'NMAP');
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({
      blockId: 'b1',
      inTitle: false,
      relLine: 0,
      colStart: 0,
      colEnd: 4,
    });
  });

  it('finds multiple occurrences on one line and across lines', () => {
    const blocks = [makeBlock({ body: 'a b a\nx a y' })];
    const matches = findMatches(blocks, 'a');
    expect(matches).toHaveLength(3);
    expect(matches.map((m) => [m.relLine, m.colStart])).toEqual([
      [0, 0],
      [0, 4],
      [1, 2],
    ]);
  });

  it('matches titles except user_message', () => {
    const titled = makeBlock({
      id: 't',
      title: 'Port Scan',
      body: 'body',
      lineStart: 10,
    });
    const userMsg = makeBlock({
      id: 'u',
      type: 'user_message',
      title: '用户',
      body: 'check this host',
      lineStart: 20,
    });
    const matches = findMatches([titled, userMsg], 'scan');
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({ blockId: 't', inTitle: true });
  });

  it('preserves transcript order', () => {
    const blocks = [
      makeBlock({ id: 'a', body: 'apple' }),
      makeBlock({ id: 'b', body: 'apple' }),
    ];
    expect(findMatches(blocks, 'apple').map((m) => m.blockId)).toEqual([
      'a',
      'b',
    ]);
  });
});

describe('matchAbsLine', () => {
  it('maps body lines under the header offset', () => {
    const titled = makeBlock({ title: 'T', body: 'x\ny' });
    expect(
      matchAbsLine(titled, makeMatch({ relLine: 1 })),
    ).toBe(2);
  });

  it('uses 2 header lines for user_message', () => {
    const userMsg = makeBlock({ type: 'user_message', title: '用户', body: 'x' });
    expect(
      matchAbsLine(userMsg, makeMatch({ relLine: 0 })),
    ).toBe(2);
  });

  it('title match is the block first line', () => {
    const titled = makeBlock({ title: 'T', body: 'x', lineStart: 7 });
    expect(matchAbsLine(titled, makeMatch({ inTitle: true }))).toBe(7);
  });
});

describe('highlight injection', () => {
  it('wraps a single-line title match', () => {
    expect(
      injectHighlight('Port Scan', makeMatch({ colStart: 0, colEnd: 4 })),
    ).toBe(`${SEARCH_HL_ON}Port${SEARCH_HL_OFF} Scan`);
  });

  it('wraps a body match on the correct line', () => {
    const body = 'first line\nsecond line';
    const out = injectBodyHighlight(
      body,
      makeMatch({ relLine: 1, colStart: 7, colEnd: 12 }),
    );
    expect(out).toBe(`first line\nsecond ${SEARCH_HL_ON}line${SEARCH_HL_OFF}`);
  });

  it('highlight survives markdown rendering (reverse video preserved)', () => {
    const body = 'see the needle in the haystack';
    const highlighted = injectBodyHighlight(
      body,
      makeMatch({ colStart: 8, colEnd: 14 }),
    );
    const rendered = renderMarkdown(highlighted);
    expect(rendered).toContain(SEARCH_HL_ON);
    expect(rendered).toContain(SEARCH_HL_OFF);
  });
});
