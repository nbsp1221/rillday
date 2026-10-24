import type {} from '@repo/domain';
import { Temporal } from 'temporal-polyfill/implementation';
import { deviceZone, todayIn } from '../context.ts';

export { dateSchema } from '@repo/domain';

export function dateKey(date = new Date()): string {
  return todayIn(deviceZone(), date.toISOString());
}

export function addDays(value: string, count: number): string {
  return Temporal.PlainDate.from(value).add({ days: count }).toString();
}

export function startOfWeek(value: string, weekStartsOn: 0 | 1 = 1): string {
  const date = Temporal.PlainDate.from(value);
  const daysSinceStart = ((date.dayOfWeek % 7) - weekStartsOn + 7) % 7;

  return date.subtract({ days: daysSinceStart }).toString();
}

export function clockTime(hour: number, minute: number, period?: 'am' | 'pm'): string | null {
  if (period && (hour < 1 || hour > 12)) {
    return null;
  }

  try {
    return Temporal.PlainTime.from(
      { hour: period ? (hour % 12) + (period === 'pm' ? 12 : 0) : hour, minute },
      { overflow: 'reject' },
    ).toString({ smallestUnit: 'minute' });
  } catch {
    return null;
  }
}

export function monthDays(value: string, weekStartsOn: 0 | 1 = 1): string[] {
  const month = Temporal.PlainDate.from(value).with({ day: 1 });
  const first = startOfWeek(month.toString(), weekStartsOn);

  return Array.from({ length: 42 }, (_, index) => addDays(first, index));
}
