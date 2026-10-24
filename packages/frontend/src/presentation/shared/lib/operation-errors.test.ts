import { expect, test } from 'vitest';
import { createTranslations } from '../i18n/index';
import { operationError, syncError } from './operation-errors';

const { t } = createTranslations('en');

test('a known operation error retains its specific message', () => {
  expect(operationError(t, 'not_found', 'fallback')).toBe(
    'The item was deleted or is no longer available.',
  );
});

test.for(['list', 'label', 'task', 'habit', 'quadrant'])(
  'invalid %s records produce a validation message rather than a network error',
  (kind) => {
    expect(operationError(t, `invalid_${kind}`, 'fallback')).toBe(
      'The change is invalid. Check the values you entered.',
    );
  },
);

test.for([
  'constructor',
  'toString',
  '__proto__',
  'valueOf',
  'hasOwnProperty',
  'unknown_server_code',
])('an unknown code %s always produces a translatable fallback', (code) => {
  expect(operationError(t, code, 'fallback')).toBe('fallback');
  expect(syncError(t, code)).toBe('Could not connect. Check the server URL and availability.');
});
