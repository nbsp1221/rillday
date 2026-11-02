import { expect, test } from 'vitest';
import type { HabitRule } from '../rules/habit-rule.ts';
import {
  type HabitProgressSource,
  completedCheckIn,
  dailyHabitProgress,
  habitStatistics,
} from './habit-progress.ts';

const rule: HabitRule = {
  from: '2026-10-12',
  kind: 'quantity',
  goal: 8,
  unit: 'cups',
  step: 1,
  frequency: 'daily',
  weekdays: [],
  weeklyTarget: 2,
  intervalDays: 1,
};
const habit: HabitProgressSource = {
  id: 'water',
  startDate: rule.from,
  rules: [rule],
  archived: false,
};

const reading = (date: string, value = 8) => ({
  habitId: habit.id,
  date,
  value,
  skipped: false,
});

test('recorded goals survive rule changes; skipped days do not break a daily streak', () => {
  const logs = [
    { ...reading('2026-10-12', 4), goal: 4 },
    { ...reading('2026-10-13', 0), skipped: true },
    reading('2026-10-14'),
    reading('2026-10-15'),
  ];

  expect(completedCheckIn(habit, logs[0])).toBe(true);
  expect(habitStatistics(habit, logs, '2026-10-14', 1)).toEqual({
    total: 2,
    week: 2,
    streak: 2,
    rate: 100,
  });
  expect(dailyHabitProgress(habit, logs[1], '2026-10-13', '2026-10-14')).toEqual({
    total: 0,
    completed: 0,
  });
  expect(dailyHabitProgress(habit, logs[3], '2026-10-15', '2026-10-14')).toEqual({
    total: 1,
    completed: 0,
  });
});

test('weekly totals regroup with the chosen week boundary and use the latest effective target', () => {
  const weekly = { ...habit, rules: [{ ...rule, frequency: 'weekly' as const }] };
  const logs = [reading('2026-10-12'), reading('2026-10-18')];

  expect(habitStatistics(weekly, logs, '2026-10-18', 1)).toEqual({
    total: 2,
    week: 2,
    rate: 100,
    streak: 1,
  });
  expect(habitStatistics(weekly, logs, '2026-10-18', 0)).toEqual({
    total: 2,
    week: 1,
    rate: 50,
    streak: 0,
  });

  const firstRule = weekly.rules[0];
  expect.assert(firstRule !== undefined);
  weekly.rules.push({ ...firstRule, from: '2026-10-18', weeklyTarget: 3 });
  expect(habitStatistics(weekly, logs, '2026-10-18', 1)).toEqual({
    total: 2,
    week: 2,
    rate: 67,
    streak: 0,
  });
});
