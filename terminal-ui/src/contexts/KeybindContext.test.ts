import { describe, expect, it } from 'vitest';
import { inkKeyToParsedKey, type InkKey } from './KeybindContext.js';

function parse(input: string, key: InkKey) {
  return inkKeyToParsedKey(input, key);
}

describe('inkKeyToParsedKey', () => {
  it('maps Ctrl+F to a ctrl f key', () => {
    expect(parse('f', { ctrl: true })).toEqual({ name: 'f', ctrl: true });
  });

  it('maps Enter and Shift+Enter', () => {
    expect(parse('\r', { return: true })).toEqual({ name: 'return' });
    expect(parse('\r', { return: true, shift: true })).toEqual({
      name: 'return',
      shift: true,
    });
  });

  it('maps plain letters without modifiers', () => {
    expect(parse('o', {})).toEqual({ name: 'o' });
  });
});
