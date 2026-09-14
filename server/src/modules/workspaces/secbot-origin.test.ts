import { describe, expect, it } from 'vitest';
import { InvalidNodeAddressError, parseSecbotOrigin, parseSshHost } from './secbot-origin';

describe('parseSecbotOrigin', () => {
  it('adds http and strips path', () => {
    expect(parseSecbotOrigin('127.0.0.1:8000/foo')).toBe('http://127.0.0.1:8000');
  });

  it('keeps https origin', () => {
    expect(parseSecbotOrigin('https://lab.example:8443')).toBe('https://lab.example:8443');
  });

  it('rejects credentials in the URL', () => {
    expect(() => parseSecbotOrigin('http://user:pass@host:8000')).toThrow(InvalidNodeAddressError);
  });
});

describe('parseSshHost', () => {
  it('reads host and port', () => {
    expect(parseSshHost('ssh://root@10.0.0.8:2222')).toEqual({ host: '10.0.0.8', port: 2222 });
  });

  it('defaults to port 22', () => {
    expect(parseSshHost('10.0.0.8')).toEqual({ host: '10.0.0.8', port: 22 });
  });
});
