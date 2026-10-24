import { expect, test } from 'vitest';
import { incrementQuantity, quantityValue, recordQuantity } from './recorded-quantity.ts';

test('quantity entries preserve decimal precision and have an identity', () => {
  const zero = recordQuantity(0, 'initial');
  const first = incrementQuantity(zero, 0.1, 'first');
  const second = incrementQuantity(first, 0.2, 'second');
  expect(quantityValue(second)).toBe(0.3);
  expect(incrementQuantity(second, 0.2, 'second')).toBe(second);
  expect(() => incrementQuantity(second, 0.3, 'second')).toThrow('edit_conflict');
});

test('a manual correction replaces the recorded amount without changing the previous value', () => {
  const base = incrementQuantity(recordQuantity(3, 'initial'), 1, 'entry');
  const correction = recordQuantity(10, 'correction');
  expect(quantityValue(base)).toBe(4);
  expect(quantityValue(correction)).toBe(10);
});

test('invalid quantities and negative results are rejected', () => {
  const base = recordQuantity(1, 'initial');
  expect(() => incrementQuantity(base, -2, 'entry')).toThrow('negative_value');
  expect(() => recordQuantity(-0.0000001, 'correction')).toThrow('invalid_habitLog');
  expect(() => recordQuantity(1000000001, 'correction')).toThrow('invalid_habitLog');
});
