import { Temporal } from 'temporal-polyfill/implementation';

export function nextDate(
  value: string,
  repeat: { frequency: string; interval: number; anchorDay?: number | null; until?: string | null },
): string | null {
  let date = Temporal.PlainDate.from(value);

  if (repeat.frequency === 'monthly') {
    const anchor = repeat.anchorDay ?? date.day;

    date = date.with({ day: 1 }).add({ months: repeat.interval });
    date = date.with({ day: anchor }, { overflow: 'constrain' });
  } else if (repeat.frequency === 'weekdays') {
    for (let i = 0; i < repeat.interval; i++) {
      do {
        date = date.add({ days: 1 });
      } while (date.dayOfWeek > 5);
    }
  } else {
    date = date.add(
      repeat.frequency === 'weekly' ? { weeks: repeat.interval } : { days: repeat.interval },
    );
  }
  const next = date.toString();

  return repeat.until && next > repeat.until ? null : next;
}
