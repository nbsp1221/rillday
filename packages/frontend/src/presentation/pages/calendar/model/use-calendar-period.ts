import { useCallback, useMemo } from 'react';
import { Temporal, Intl as TemporalIntl } from 'temporal-polyfill/implementation';
import { type CalendarViewMode, addDays, monthDays, startOfWeek } from '#application';
import { useAppPreferences } from '#entities/preferences';
import { useI18n } from '#shared/i18n';

export function useCalendarPeriod(anchor: string, mode: CalendarViewMode) {
  const { dateLocale, weekdayNames: dayNames } = useI18n();
  const { preferences } = useAppPreferences();
  const weekStart = useCallback(
    (date: string) => startOfWeek(date, preferences.weekStartsOn),
    [preferences.weekStartsOn],
  );

  const monthDates = useCallback(
    (date: string) => monthDays(date, preferences.weekStartsOn),
    [preferences.weekStartsOn],
  );

  const weekdayOrder = Array.from({ length: 7 }, (_, i) => (preferences.weekStartsOn + i) % 7);

  const weekdays = weekdayOrder.map((day) => dayNames[day]);

  const dayNamesForCalendar = (date: string) =>
    dayNames[Temporal.PlainDate.from(date).dayOfWeek % 7];

  const dates = useMemo(
    () =>
      mode === 'month'
        ? monthDates(anchor)
        : mode === 'week'
          ? Array.from({ length: 7 }, (_, i) => addDays(weekStart(anchor), i))
          : [anchor],
    [mode, anchor, monthDates, weekStart],
  );

  const monthFormat = useMemo(
    () => new TemporalIntl.DateTimeFormat(dateLocale, { month: 'long' }),
    [dateLocale],
  );

  const title = useMemo(
    () =>
      mode === 'week'
        ? new TemporalIntl.DateTimeFormat(dateLocale, {
            year: 'numeric',
            month: 'short',
            day: 'numeric',
          }).formatRange(
            Temporal.PlainDate.from(dates[0]),
            Temporal.PlainDate.from(dates[dates.length - 1]),
          )
        : Temporal.PlainDate.from(anchor).toLocaleString(
            dateLocale,
            mode === 'day'
              ? { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' }
              : mode === 'year'
                ? { year: 'numeric' }
                : { year: 'numeric', month: 'long' },
          ),
    [mode, anchor, dates, dateLocale],
  );

  return { dates, weekdays, dayNamesForCalendar, monthDates, monthFormat, title };
}
