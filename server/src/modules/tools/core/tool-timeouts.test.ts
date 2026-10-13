import { describe, expect, it } from 'vitest';
import { terminalTail } from './spawn-terminal';
import { resolveToolTimeout } from './tool-timeouts';

describe('resolveToolTimeout', () => {
  it('uses each tool default when the caller omits timeout', () => {
    expect(resolveToolTimeout('nuclei_scan')).toBe(1200);
    expect(resolveToolTimeout('nikto_scan')).toBe(600);
    expect(resolveToolTimeout('nmap_scan')).toBe(300);
    expect(resolveToolTimeout('ffuf_scan')).toBe(300);
    expect(resolveToolTimeout('execute_command')).toBe(30);
  });

  it('keeps a requested timeout inside that tool cap', () => {
    expect(resolveToolTimeout('nuclei_scan', 90)).toBe(90);
    expect(resolveToolTimeout('nuclei_scan', 99999)).toBe(3600);
    expect(resolveToolTimeout('ffuf_scan', 5000)).toBe(1200);
  });
});

describe('terminalTail', () => {
  it('keeps the latest lines and unfolds carriage-return progress', () => {
    const text = 'line-a\rline-b\nline-c\r\nline-d';
    expect(terminalTail(text, 2)).toBe('line-c\nline-d');
  });
});
