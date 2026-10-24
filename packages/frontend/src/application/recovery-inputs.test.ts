import { expect, test } from 'vitest';
import { recoverCapturedInputs } from './recovery-inputs.ts';

test('recovery exposes authored inputs without leaking backup envelopes to presentation', () => {
  const source = JSON.stringify({
    captureDrafts: [
      ['capture:inbox', { text: 'Keep #literal text', selection: 4 }],
      ['capture:list', { text: '  Keep whitespace  ' }, 'extra'],
      ['invalid', { text: 42 }],
      null,
      [3, { text: 'Not a named input' }],
    ],
    internalMetadata: { version: 1 },
  });
  expect(recoverCapturedInputs(source)).toEqual([
    { key: 'capture:inbox', text: 'Keep #literal text' },
    { key: 'capture:list', text: '  Keep whitespace  ' },
  ]);
});

test('recovery handles absent inputs and propagates malformed JSON', () => {
  for (const source of ['null', '[]', '{}', '{"captureDrafts":null}']) {
    expect(recoverCapturedInputs(source)).toEqual([]);
  }
  expect(() => recoverCapturedInputs('{')).toThrow(SyntaxError);
});
