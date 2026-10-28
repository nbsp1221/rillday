import { Button } from '@repo/ui/components/button';
import { cn } from 'cn';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Temporal } from 'temporal-polyfill/implementation';
import {
  type Habit,
  habitAt,
  habitDone,
  habitLogFor,
  habitScheduled,
  habitStartDate,
  habitToday,
  monthDays,
} from '#application';
import { useAppPreferences } from '#entities/preferences';
import { useWorkspace } from '#entities/workspace';
import { useI18n } from '#shared/i18n';
import { useHabitDisplay } from './habit-display';

export function HabitHistory({
  habit,
  logDate,
  onDateChange,
  statsMonth,
  onMonthChange,
}: {
  habit: Habit;
  logDate: string;
  onDateChange: (date: string) => void;
  statsMonth: string;
  onMonthChange: (month: string) => void;
}) {
  const { t, dateLocale, formatDate } = useI18n();
  const { preferences } = useAppPreferences();
  const { data } = useWorkspace();
  const { weekdayOrder, dayNames } = useHabitDisplay();
  const today = habitToday(habit);
  const start = habitStartDate(habit);
  const month = Temporal.PlainDate.from(statsMonth).with({ day: 1 });
  const yearMonth = month.toPlainYearMonth();
  const firstMonth = Temporal.PlainDate.from(start).toPlainYearMonth();
  const lastMonth = Temporal.PlainDate.from(today).toPlainYearMonth();

  const monthDates = (date: string) => monthDays(date, preferences.weekStartsOn);

  return (
    <div className="habit-history mt-6 [&_>_p]:text-xs [&_>_p]:text-muted-foreground [&_>_p]:mt-3 [&_>_p]:leading-(--text-xs--line-height)">
      <div className="habit-history-heading mb-3 flex items-center gap-3 [&_h3]:m-0 [&_h3]:flex-1 [&_h3]:text-sm [&_h3]:font-medium">
        <h3>
          {month.toLocaleString(dateLocale, {
            year: 'numeric',
            month: 'long',
          })}
        </h3>
        <Button
          variant="ghost"
          size="icon-sm"
          className="text-muted-foreground"
          aria-label={t('dates.previousMonth')}
          disabled={Temporal.PlainYearMonth.compare(yearMonth, firstMonth) <= 0}
          onClick={() => {
            onMonthChange(month.subtract({ months: 1 }).toString());
          }}
        >
          <ChevronLeft className="size-3.5 inline-block shrink-0 align-middle" />
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          className="text-muted-foreground"
          aria-label={t('dates.nextMonth')}
          disabled={Temporal.PlainYearMonth.compare(yearMonth, lastMonth) >= 0}
          onClick={() => {
            onMonthChange(month.add({ months: 1 }).toString());
          }}
        >
          <ChevronRight className="size-3.5 inline-block shrink-0 align-middle" />
        </Button>
      </div>
      <div className="habit-history-grid grid grid-cols-7 gap-1 text-center [&_>_span]:pb-2 [&_>_span]:text-xs [&_>_span]:text-muted-foreground">
        {weekdayOrder.map((day) => (
          <span key={day}>{dayNames[day]}</span>
        ))}
        {monthDates(statsMonth).map((date) => {
          const day = Temporal.PlainDate.from(date);
          const log = habitLogFor(data.habitLogs, habit.id, date);

          return (
            <Button
              variant="ghost"
              size="icon"
              key={date}
              disabled={date > today || date < start || (!habitScheduled(habit, date) && !log)}
              aria-pressed={date === logDate}
              aria-label={t('habits.statusSummary', {
                date: formatDate(date),
                status: log?.skipped
                  ? t('habits.skipped')
                  : habitAt(habit, date).frequency === 'weekly-total' && log?.value
                    ? t('habits.recordedAmount', { value: log.value, unit: log.unit ?? habit.unit })
                    : habitDone(habit, log)
                      ? t('common.complete')
                      : t('habits.incomplete'),
              })}
              title={`${formatDate(date)} ${log?.note || ''}`}
              onClick={() => onDateChange(date)}
              className={cn(
                'relative aspect-square w-full max-w-9 justify-self-center rounded-full border border-transparent p-0 text-xs text-muted-foreground',
                !day.toPlainYearMonth().equals(yearMonth) && 'outside',
                habitDone(habit, log) &&
                  'done bg-habit-color text-habit-on-color hover:bg-habit-color hover:text-habit-on-color hover:shadow-[inset_0_0_0_2px_color-mix(in_srgb,_var(--habit-on-color)_30%,_transparent)] dark:hover:bg-habit-color',
                log?.skipped && 'skipped border-separator bg-transparent',
                date === logDate && 'selected outline outline-ring outline-offset-1',
              )}
            >
              {day.day}
              {habitAt(habit, date).frequency === 'weekly-total' &&
                !log?.skipped &&
                Boolean(log?.value) && (
                  <span
                    aria-hidden="true"
                    className="habit-record-mark absolute bottom-1 left-1/2 size-1 -translate-x-1/2 rounded-full bg-habit-color"
                  />
                )}
            </Button>
          );
        })}
      </div>
      <p>{t('habits.selectDateHint')}</p>
    </div>
  );
}
