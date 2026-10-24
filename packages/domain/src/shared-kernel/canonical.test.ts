import { expect, test } from 'vitest';
import { canonical, hash } from './canonical.ts';

test('hash inputs follow JSON transport semantics without changing user text or source values', () => {
  const input = {
    title: '한글 English 😀 e\u0301',
    optional: undefined,
    metadata: { b: 2, a: 1 },
    values: [undefined, null, false, 0, ''],
  };
  const before = structuredClone(input);
  const transported: unknown = JSON.parse(JSON.stringify(input));
  expect.assert(typeof transported === 'object' && transported !== null);

  expect(canonical(input)).toBe(canonical(transported));
  expect(hash(canonical(input))).toBe(hash(canonical(transported)));
  const encoded = canonical(input);
  expect.assert(typeof encoded === 'string');
  expect(JSON.parse(encoded)).toEqual(transported);
  expect(input).toStrictEqual(before);
  expect(canonical([undefined])).not.toBe(canonical([]));
  expect(canonical([1, 2])).not.toBe(canonical([2, 1]));
  expect(new Set([null, false, 0, ''].map((value) => canonical(value))).size).toBe(4);
  expect(canonical(undefined)).toBeUndefined();
  expect(canonical(undefined)).not.toBe(canonical(null));
  expect(canonical('é')).not.toBe(canonical('e\u0301'));
});
