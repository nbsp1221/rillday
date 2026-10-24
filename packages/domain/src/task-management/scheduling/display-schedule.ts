import { Temporal } from 'temporal-polyfill/implementation';
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
  const local = Temporal.Instant.from(instant ?? scheduleInstant(schedule)!).toZonedDateTimeISO(
    zone,
  );
  let repeat = schedule.repeat;
  if (repeat?.until) {
    const last = Temporal.Instant.from(
      scheduleInstant({ ...schedule, date: repeat.until })!,
    ).toZonedDateTimeISO(zone);
    repeat = { ...repeat, until: last.toPlainDate().toString() };
  }
  return {
    date: local.toPlainDate().toString(),
    time: local.toPlainTime().toString({ smallestUnit: 'minute' }),
    repeat,
  };
}
