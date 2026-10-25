import { Temporal } from 'temporal-polyfill/implementation';
import invariant from 'tiny-invariant';
import { scheduleInstant } from './clock.ts';

interface DisplaySchedule {
  date: string | null;
  time: string | null;
  zone: string | null;
  repeat: {
    frequency: 'daily' | 'weekly' | 'monthly' | 'weekdays';
    interval: number;
    until?: string | null;
    anchorDay?: number | null;
  } | null;
}

export function displaySchedule(schedule: DisplaySchedule, zone: string, instant?: string | null) {
  if (!schedule.date || !schedule.time || !schedule.zone) {
    return { date: schedule.date, time: schedule.time, repeat: schedule.repeat };
  }
  const start = instant ?? scheduleInstant(schedule);
  invariant(start !== null, 'Timed schedule requires an instant');
  const local = Temporal.Instant.from(start).toZonedDateTimeISO(zone);
  let repeat = schedule.repeat;
  if (repeat?.until) {
    const end = scheduleInstant({ ...schedule, date: repeat.until });
    invariant(end !== null, 'Timed repeat requires an end instant');
    const last = Temporal.Instant.from(end).toZonedDateTimeISO(zone);
    repeat = { ...repeat, until: last.toPlainDate().toString() };
  }
  return {
    date: local.toPlainDate().toString(),
    time: local.toPlainTime().toString({ smallestUnit: 'minute' }),
    repeat,
  };
}
