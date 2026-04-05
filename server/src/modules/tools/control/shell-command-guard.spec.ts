import { describe, expect, it } from 'vitest';
import { shellProfile, validateCommandAgainstShell } from './shell-command-guard';

describe('validateCommandAgainstShell', () => {
  it('flags cmdlet-style command in cmd profile', () => {
    const profile = shellProfile('cmd', 'cmd.exe');
    expect(validateCommandAgainstShell('Get-ChildItem', profile)).toContain('PowerShell');
  });

  it('allows plain cmd usage', () => {
    const profile = shellProfile('cmd', 'cmd.exe');
    expect(validateCommandAgainstShell('dir /b', profile)).toBeNull();
  });

  it('flags findstr in posix profile', () => {
    const profile = shellProfile('posix', 'bash');
    expect(validateCommandAgainstShell('findstr /i foo bar.txt', profile)).toContain('cmd');
  });

  it('allows posix commands', () => {
    const profile = shellProfile('posix', 'bash');
    expect(validateCommandAgainstShell('grep -R pattern .', profile)).toBeNull();
  });
});
