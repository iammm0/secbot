import { describe, expect, it } from 'vitest';
import { requiredRuntimeTools } from './runtime-tools';

describe('requiredRuntimeTools', () => {
  it('keeps nikto optional only on Windows', () => {
    const tools = requiredRuntimeTools();
    const nikto = tools.find((tool) => tool.id === 'nikto');
    expect(nikto).toBeTruthy();
    if (process.platform === 'win32') {
      expect(nikto?.kind).toBe('optional');
      expect(tools.filter((tool) => tool.kind === 'required').map((tool) => tool.id)).toEqual([
        'nmap',
        'nuclei',
        'ffuf',
      ]);
    } else {
      expect(nikto?.kind).toBe('required');
    }
  });
});
