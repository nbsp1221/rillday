import { expect, test, vi } from 'vitest';
import {
  type Habit,
  habitDayProgress,
  habitScheduled,
  habitStartDate,
  habitStats,
  habitToday,
  monthDays,
  startOfWeek,
} from './index.ts';

const habit = (options: Partial<Habit> = {}): Habit => ({
  id: 'h1',
  name: 'Walking',
  color: '#90ad87',
  icon: '🌿',
  goal: 1,
  unit: 'times',
  kind: 'boolean',
  frequency: 'daily',
  weekdays: [1, 2, 3, 4, 5],
  weeklyTarget: 3,
  reminderTime: null,
  archived: false,
  createdAt: '2026-10-01T03:00:00.000Z',
  ...options,
});

test('habit intervals and selected weekdays follow their schedule', () => {
  const h = habit({ frequency: 'interval', intervalDays: 3 });
  expect(habitScheduled(h, '2026-10-01')).toBe(true);
  expect(habitScheduled(h, '2026-10-02')).toBe(false);
  expect(habitScheduled(h, '2026-10-04')).toBe(true);
  expect(habitScheduled(habit({ frequency: 'weekdays' }), '2026-10-17')).toBe(false);
});

test('habit stats exclude future records and count weekly target streaks', () => {
  const h = habit({ frequency: 'weekly', weeklyTarget: 2, createdAt: '2026-10-05T03:00:00Z' });
  const logs = ['2026-10-05', '2026-10-06', '2026-10-12', '2026-10-13', '2026-10-30'].map(
    (date) => ({ habitId: h.id, date, value: 1, skipped: false, note: '' }),
  );
  const stats = habitStats(h, logs, '2026-10-16');
  expect(stats.total).toBe(4);
  expect(stats.week).toBe(2);
  expect(stats.streak).toBe(2);
  expect(stats.rate).toBe(100);
});

test('daily habit progress excludes archived, skipped, off-schedule and not-yet-started habits', () => {
  const items = [
    habit({ id: 'done' }),
    habit({ id: 'partial', kind: 'quantity', goal: 8 }),
    habit({ id: 'skip' }),
    habit({ id: 'archived', archived: true }),
    habit({ id: 'weekday', frequency: 'weekdays', weekdays: [1] }),
    habit({ id: 'future', startDate: '2026-10-20' }),
  ];
  const logs = [
    { habitId: 'done', date: '2026-10-17', value: 1, skipped: false, note: '' },
    { habitId: 'partial', date: '2026-10-17', value: 5, skipped: false, note: '' },
    { habitId: 'skip', date: '2026-10-17', value: 0, skipped: true, note: '' },
  ];
  expect(habitDayProgress(items, logs, '2026-10-17', '2026-10-17')).toStrictEqual({
    total: 2,
    completed: 1,
  });
  expect(
    habitDayProgress(
      items,
      [{ habitId: 'done', date: '2026-10-18', value: 1, skipped: false, note: '' }],
      '2026-10-18',
      '2026-10-17',
    ),
  ).toStrictEqual({ total: 3, completed: 0 });
});

test('habit intervals count civil dates even when the device skipped a day', () => {
  vi.stubEnv('TZ', 'Pacific/Apia');

  const scheduledHabit = habit({
    startDate: '2011-12-29',
    frequency: 'interval',
    intervalDays: 2,
  });

  expect(habitScheduled(scheduledHabit, '2011-12-30')).toBe(false);
  expect(habitScheduled(scheduledHabit, '2011-12-31')).toBe(true);
});

test('week start changes calendar coordinates and weekly habit periods together', () => {
  expect(startOfWeek('2026-10-18', 0)).toBe('2026-10-18');
  expect(startOfWeek('2026-10-18', 1)).toBe('2026-10-12');
  expect(monthDays('2026-10-01', 0)[0]).toBe('2026-09-27');
  const h = habit({ frequency: 'weekly', weeklyTarget: 2 });
  const logs = ['2026-10-12', '2026-10-18'].map((date) => ({
    habitId: h.id,
    date,
    value: 1,
    skipped: false,
    note: '',
  }));
  expect(habitStats(h, logs, '2026-10-18', 1).week).toBe(2);
  expect(habitStats(h, logs, '2026-10-18', 0).week).toBe(1);
});

test('persisted rule history follows the selected week start for rates and streaks too', () => {
  const h = habit({ frequency: 'weekly', weeklyTarget: 2, startDate: '2026-10-12' });
  h.rules = [
    {
      from: '2026-10-12',
      kind: h.kind,
      goal: 1,
      unit: h.unit,
      step: 1,
      frequency: 'weekly',
      weekdays: [],
      weeklyTarget: 2,
      intervalDays: 1,
    },
  ];
  const logs = ['2026-10-12', '2026-10-18'].map((date) => ({
    habitId: h.id,
    date,
    value: 1,
    skipped: false,
    note: '',
  }));

  expect(habitStats(h, logs, '2026-10-18', 1)).toEqual({ total: 2, week: 2, rate: 100, streak: 1 });
  expect(habitStats(h, logs, '2026-10-18', 0)).toEqual({ total: 2, week: 1, rate: 50, streak: 0 });

  const firstRule = h.rules[0];
  expect.assert(firstRule !== undefined);
  h.rules.push({ ...firstRule, from: '2026-10-18', weeklyTarget: 3 });
  expect(habitStats(h, logs, '2026-10-18', 1)).toEqual({ total: 2, week: 2, rate: 67, streak: 0 });
});

test('habit day boundaries use their accounting zone rather than a travelling device zone', () => {
  const now = '2026-10-19T01:00:00Z';
  const habit: Habit = {
    id: 'water',
    name: 'Water',
    color: '#7d9cc4',
    icon: 'water',
    kind: 'quantity',
    goal: 8,
    unit: 'cups',
    frequency: 'daily',
    weekdays: [],
    weeklyTarget: 3,
    reminderTime: null,
    archived: false,
    createdAt: '2026-10-01T00:00:00Z',
    zone: 'Asia/Seoul',
  };

  expect(habitToday(habit, now)).toBe('2026-10-19');
  expect(habitToday({ ...habit, zone: 'America/New_York' }, now)).toBe('2026-10-18');

  vi.stubEnv('TZ', 'Pacific/Apia');

  const started = { ...habit, createdAt: '2026-10-01T22:00:00Z' };

  expect(habitStartDate(started)).toBe('2026-10-02');
  expect(habitStartDate({ ...started, zone: 'America/New_York' })).toBe('2026-10-01');
});
