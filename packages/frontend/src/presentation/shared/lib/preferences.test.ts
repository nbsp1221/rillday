import { expect, test } from 'vitest';
import { calendarViews, defaultPreferences, normalizePreferences } from '#application';

test('task view settings accept known values and isolate malformed or obsolete records', () => {
  const value = normalizePreferences({
    taskViews: {
      'all': { sort: 'title', group: 'list' },
      'today': { sort: 'date-desc', group: 'date' },
      'trash': { sort: 'invalid', group: 'none' },
      'list:work': { sort: 'manual', group: 'priority' },
      'obsolete': { sort: 'manual', group: 'none' },
      'next': null,
    },
  });
  expect(value.taskViews).toStrictEqual({
    'all': { sort: 'title', group: 'list' },
    'today': { sort: 'date-desc', group: 'date' },
    'list:work': { sort: 'manual', group: 'priority' },
  });
  value.taskViews.all.sort = 'manual';
  expect(defaultPreferences.taskViews).toStrictEqual({});
  expect(normalizePreferences({ taskViews: [] }).taskViews).toStrictEqual({});
});

test('preference validation accepts partial records and rejects unsafe enum/range values', () => {
  expect(normalizePreferences(null)).toStrictEqual(defaultPreferences);
  expect(defaultPreferences.language).toBe('en');
  expect(normalizePreferences({ language: 'ko' }).language).toBe('ko');
  expect(defaultPreferences.weekStartsOn).toBe(0);
  expect(normalizePreferences({ weekStartsOn: 1 }).weekStartsOn).toBe(1);
  const value = normalizePreferences({
    language: 'en',
    theme: 'system',
    weekStartsOn: 5,
    calendarDayCount: 999,
    calendarWeekCount: 1,
    showCompleted: 'yes',
    calendarView: 'weeks',
  });
  expect(value.language).toBe('en');
  expect(value.theme).toBe('system');
  expect(value.weekStartsOn).toBe(0);
  expect(Object.hasOwn(value, 'calendarDayCount')).toBe(false);
  expect(Object.hasOwn(value, 'calendarWeekCount')).toBe(false);
  expect(value.showCompleted).toBe(false);
  expect(value.calendarView).toBe('month');
  expect(calendarViews).toStrictEqual(['day', 'week', 'month', 'year', 'agenda']);
  for (const view of calendarViews) {
    expect(normalizePreferences({ calendarView: view }).calendarView).toBe(view);
  }
  expect(normalizePreferences({ calendarView: 'days' }).calendarView).toBe('month');
});
