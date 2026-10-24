import { Temporal } from 'temporal-polyfill/implementation';

export function scheduleInstant(schedule: {
  date: string | null;
  time: string | null;
  zone: string | null;
}): string | null {
  if (!schedule.date || !schedule.time) {
    return null;
  }
  return Temporal.PlainDateTime.from(`${schedule.date}T${schedule.time}`)
    .toZonedDateTime(schedule.zone!, { disambiguation: 'compatible' })
    .toInstant()
    .toString();
}

export function todayIn(zone: string, now: string) {
  return Temporal.Instant.from(now).toZonedDateTimeISO(zone).toPlainDate().toString();
}
