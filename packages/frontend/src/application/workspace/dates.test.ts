import { expect, test, vi } from 'vitest';
import { dateKey, monthDays, parseQuickInput } from './index.ts';

test('all-day capture and calendar coordinates remain stable across daylight saving boundaries', () => {
  vi.stubEnv('TZ', 'America/New_York');

  expect(new Date('2026-03-07T12:00:00').getTimezoneOffset()).toBe(300);
  expect(parseQuickInput('Delivery day after tomorrow', '2026-03-07').date).toBe('2026-03-09');
  expect(parseQuickInput('Delivery day after tomorrow', '2026-10-31').date).toBe('2026-11-02');
  expect(monthDays('2026-03-08')).toHaveLength(42);
});

test.each(['Asia/Seoul', 'America/New_York', 'Pacific/Apia'])(
  'all-day capture and calendar coordinates do not depend on device zone %s',
  (zone) => {
    vi.stubEnv('TZ', zone);

    const dates = monthDays('2011-12-29');

    expect(dates).toHaveLength(42);
    expect(new Set(dates).size).toBe(42);
    expect(dates[0]).toBe('2011-11-28');
    expect(dates.at(-1)).toBe('2012-01-08');
    expect(dates).toContain('2011-12-30');
    expect(parseQuickInput('Delivery tomorrow', '2011-12-29').date).toBe('2011-12-30');
    expect(parseQuickInput('Delivery 2011-12-30', '2011-12-29').date).toBe('2011-12-30');
  },
);

test('ISO dates below year 100 retain their year through capture and the clock boundary', () => {
  expect(parseQuickInput('Entry 0099-01-01', '2026-10-20').date).toBe('0099-01-01');
  expect(dateKey(new Date('0099-01-01T12:00:00Z'))).toBe('0099-01-01');
});
