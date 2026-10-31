import { expect, test } from 'vitest';
import { habitRuleSchema, reviseHabitRules } from '../rules/habit-rule.ts';
import type { HabitProgressSource } from './habit-progress.ts';
import { completedCheckIn, dailyHabitProgress, habitStatistics } from './habit-progress.ts';
import { weeklyHabitAmount } from './weekly-amount.ts';

const rule = {
  from: '2026-10-18',
  kind: 'quantity' as const,
  goal: 60,
  unit: 'minutes',
  step: 10,
  frequency: 'weekly-total' as const,
  weekdays: [],
  weeklyTarget: 3,
  intervalDays: 1,
};
const habit: HabitProgressSource = {
  id: 'reading',
  startDate: rule.from,
  archived: false,
  rules: [rule],
};

const reading = (date: string, value: number, unit = 'minutes') => ({
  habitId: 'reading',
  date,
  value,
  unit,
  skipped: false,
});

test('decimal amounts add exactly across different days and reach a fractional target', () => {
  const fractional = { ...habit, rules: [{ ...rule, goal: 0.3 }] };
  const logs = [reading('2026-10-19', 0.1), reading('2026-10-20', 0.2)];
  expect(weeklyHabitAmount(fractional, logs, '2026-10-20', 0).value).toBe(0.3);
  expect(habitStatistics(fractional, logs, '2026-10-20', 0).streak).toBe(1);
});

test('weekly amount accumulates partial entries across days and preserves excess', () => {
  const logs = [
    reading('2026-10-19', 20),
    reading('2026-10-21', 45.5),
    { ...reading('2026-10-20', 30), skipped: true },
    { ...reading('2026-10-21', 90), habitId: 'another' },
  ];
  expect(weeklyHabitAmount(habit, logs, '2026-10-22', 0)).toEqual({
    from: '2026-10-18',
    through: '2026-10-24',
    goal: 60,
    unit: 'minutes',
    value: 65.5,
    excluded: 0,
  });
  expect(completedCheckIn(habit, logs[0])).toBe(false);
  expect(dailyHabitProgress(habit, logs[0], '2026-10-19', '2026-10-22')).toEqual({
    completed: 0,
    total: 0,
  });
});
test('a cumulative goal is quantity-only', () => {
  expect(habitRuleSchema.safeParse(rule).success).toBe(true);
  expect(habitRuleSchema.safeParse({ ...rule, kind: 'boolean' }).success).toBe(false);
});
test('week preference changes boundaries rather than dates or recorded values', () => {
  const logs = [reading('2026-10-19', 20), reading('2026-10-25', 50)];
  expect(weeklyHabitAmount(habit, logs, '2026-10-25', 1).value).toBe(70);
  expect(weeklyHabitAmount(habit, logs, '2026-10-25', 0).value).toBe(50);
});
test('streak and successes count completed weeks, not partial daily amounts', () => {
  const logs = [
    reading('2026-10-19', 20),
    reading('2026-10-21', 40),
    reading('2026-10-26', 20),
    reading('2026-11-01', 100),
  ];
  expect(habitStatistics(habit, logs, '2026-10-29', 0)).toEqual({
    total: 1,
    streak: 1,
    rate: 50,
    week: 20,
  });
  expect(habitStatistics(habit, [...logs, reading('2026-10-29', 50)], '2026-10-29', 0)).toEqual({
    total: 2,
    streak: 2,
    rate: 100,
    week: 70,
  });
});
test('skipping does not reduce a cumulative target and editing past values recalculates it', () => {
  const logs = [reading('2026-10-19', 20), { ...reading('2026-10-20', 60), skipped: true }];
  expect(weeklyHabitAmount(habit, logs, '2026-10-22', 0).value).toBe(20);
  expect(habitStatistics(habit, logs, '2026-10-22', 0).total).toBe(0);
  expect(habitStatistics(habit, [{ ...logs[0], value: 60 }, logs[1]], '2026-10-22', 0).total).toBe(
    1,
  );
});
test('weekly amount edits preserve historical targets and begin next boundary', () => {
  const next = { ...rule, goal: 120 };
  const revised = { ...habit, rules: reviseHabitRules(habit, next, '2026-10-22', 0) };
  expect(revised.rules.at(-1)?.from).toBe('2026-10-25');
  expect(weeklyHabitAmount(revised, [reading('2026-10-21', 60)], '2026-10-22', 0).goal).toBe(60);
  expect(weeklyHabitAmount(revised, [], '2026-10-26', 0).goal).toBe(120);
});
test('different historical units are never silently added or converted', () => {
  const logs = [reading('2026-10-19', 30, 'pages'), reading('2026-10-20', 20)];
  const value = weeklyHabitAmount(habit, logs, '2026-10-22', 0);
  expect(value.value).toBe(20);
  expect(value.excluded).toBe(1);
});
test('a changed week boundary does not mix rule eras with different units', () => {
  const changed = {
    ...habit,
    rules: [rule, { ...rule, from: '2026-10-25', unit: 'pages', goal: 30 }],
  };
  const logs = [reading('2026-10-23', 60), reading('2026-10-25', 20, 'pages')];
  expect(weeklyHabitAmount(changed, logs, '2026-10-25', 1)).toMatchObject({
    from: '2026-10-25',
    unit: 'pages',
    goal: 30,
    value: 20,
  });
});
