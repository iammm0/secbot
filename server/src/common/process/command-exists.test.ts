import { describe, expect, it } from 'vitest';
import { windowsExecutableName } from './command-exists';

describe('windowsExecutableName', () => {
  it('appends .exe when missing', () => {
    expect(windowsExecutableName('nmap')).toBe('nmap.exe');
    expect(windowsExecutableName('nuclei.exe')).toBe('nuclei.exe');
  });
});
