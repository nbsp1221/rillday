import { type TaskInput, displaySchedule, scheduleInstant } from '@repo/domain';
import { expect, test } from 'vitest';
import { nextDate } from './recurrence.ts';

test('recurrences preserve original-zone wall time over DST; gaps and overlaps use the documented policy', () => {
  const schedule: TaskInput['schedule'] = {
    date: '2026-10-26',
    time: '09:00',
    zone: 'America/New_York',
    repeat: { frequency: 'weekly', interval: 1, until: '2026-11-09' },
    durationMinutes: 30,
    reminderMinutes: null,
  };
  expect(scheduleInstant(schedule)).toBe('2026-10-26T13:00:00Z');
  expect(scheduleInstant({ ...schedule, date: '2026-11-02' })).toBe('2026-11-02T14:00:00Z');
  expect(displaySchedule(schedule, 'Asia/Seoul').time).toBe('22:00');
  expect(displaySchedule({ ...schedule, date: '2026-11-02' }, 'Asia/Seoul').time).toBe('23:00');
  expect(scheduleInstant({ ...schedule, date: '2026-03-08', time: '02:30' })).toBe(
    '2026-03-08T07:30:00Z',
  );
  expect(scheduleInstant({ ...schedule, date: '2026-11-01', time: '01:30' })).toBe(
    '2026-11-01T05:30:00Z',
  );
});

test('inclusive repeat end, leap day, weekdays and DST are explicit', () => {
  expect(
    nextDate('2024-01-31', {
      frequency: 'monthly',
      interval: 1,
      anchorDay: 31,
    }),
  ).toBe('2024-02-29');
  expect(
    nextDate('2026-10-19', {
      frequency: 'daily',
      interval: 1,
      until: '2026-10-20',
    }),
  ).toBe('2026-10-20');
  expect(
    nextDate('2026-10-20', {
      frequency: 'daily',
      interval: 1,
      until: '2026-10-20',
    }),
  ).toBeNull();
  expect(nextDate('2026-10-16', { frequency: 'weekdays', interval: 2 })).toBe('2026-10-20');
});
