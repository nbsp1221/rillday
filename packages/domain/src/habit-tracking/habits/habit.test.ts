import { type HabitRule, scheduled } from '@repo/domain';
import { expect, test } from 'vitest';
import { type HabitData, habitSchema } from './habit.ts';

const rule: HabitRule = {
  from: '2026-10-01',
  kind: 'quantity',
  goal: 8,
  unit: 'cups',
  step: 0.1,
  frequency: 'daily',
  weekdays: [1, 2, 3, 4, 5],
  weeklyTarget: 3,
  intervalDays: 1,
};

test('rule history accepts either calendar boundary; interval rules anchor to their effective date', () => {
  const data = {
    name: 'Weekly',
    color: '#123456',
    icon: 'book',
    archived: false,
    startDate: '2026-10-01',
    rules: [{ ...rule, frequency: 'weekly' }],
    reminderTime: null,
    zone: 'Asia/Seoul',
    rank: 'a0',
  };
  expect(() =>
    habitSchema.parse({
      ...data,
      rules: [...data.rules, { ...rule, from: '2026-10-19', frequency: 'weekly' }],
    }),
  ).not.toThrow();
  expect(() =>
    habitSchema.parse({
      ...data,
      rules: [...data.rules, { ...rule, from: '2026-10-25', frequency: 'weekly' }],
    }),
  ).not.toThrow();
  expect(() =>
    habitSchema.parse({
      ...data,
      rules: [...data.rules, { ...rule, from: '2026-09-30', frequency: 'weekly' }],
    }),
  ).toThrow();

  const interval: HabitData = {
    ...data,
    rules: [rule, { ...rule, from: '2026-10-19', frequency: 'interval', intervalDays: 3 }],
  };
  expect(scheduled(interval, '2026-10-19')).toBe(true);
  expect(scheduled(interval, '2026-10-20')).toBe(false);
  expect(scheduled(interval, '2026-10-22')).toBe(true);
});
