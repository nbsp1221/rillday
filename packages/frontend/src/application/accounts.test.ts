import { expect, test } from 'vitest';
import { normalizeServerUrl } from './accounts.ts';

test('server addresses normalize origins and reject invalid URLs, credentials and unsupported subpaths', () => {
  expect(normalizeServerUrl(' https://rillday.example.com/ ')).toBe('https://rillday.example.com');
  expect(normalizeServerUrl('http://127.0.0.1:4287')).toBe('http://127.0.0.1:4287');
  for (const value of [
    'not a URL',
    'ftp://rillday.example.com',
    'https://user:password@rillday.example.com',
    'https://rillday.example.com/app',
    'https://rillday.example.com/?token=x',
  ]) {
    expect(() => normalizeServerUrl(value)).toThrow(/invalid_server_url/);
  }
});
