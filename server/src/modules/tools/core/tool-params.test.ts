import { describe, expect, it } from 'vitest';
import { firstString, stringList } from './tool-params';

describe('tool param aliases', () => {
  it('reads url before target', () => {
    expect(
      firstString({ url: ' http://127.0.0.1:8000 ', target: '127.0.0.1' }, ['url', 'target']),
    ).toBe('http://127.0.0.1:8000');
  });

  it('accepts a target when url is absent', () => {
    expect(firstString({ target: 'http://127.0.0.1:8000' }, ['url', 'target'])).toBe(
      'http://127.0.0.1:8000',
    );
  });

  it('flattens a targets array and drops duplicates', () => {
    expect(
      stringList(
        { targets: ['http://127.0.0.1:8000', 'http://127.0.0.1:5173', 'http://127.0.0.1:8000'] },
        ['target', 'targets'],
      ),
    ).toEqual(['http://127.0.0.1:8000', 'http://127.0.0.1:5173']);
  });
});
