import { describe, expect, it } from 'vitest';
import { resolveAgentType } from './resolve-agent';

describe('resolveAgentType', () => {
  it('maps aliases to canonical agent ids', () => {
    expect(resolveAgentType('secbot-cli')).toBe('hackbot');
    expect(resolveAgentType('super')).toBe('superhackbot');
    expect(resolveAgentType('Hackbot')).toBe('hackbot');
    expect(resolveAgentType('unknown')).toBe('hackbot');
  });
});
