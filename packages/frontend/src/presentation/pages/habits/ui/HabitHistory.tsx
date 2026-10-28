import { Button as ButtonPrimitive } from '@base-ui/react/button';
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
      <div className="habit-history-heading [&_button]:w-8 [&_button]:h-8 [&_button]:p-0 [&_button]:border-0 [&_button]:rounded-sm [&_button]:bg-transparent [&_button]:grid [&_button]:place-items-center [&_button]:text-muted-foreground [&_button]:shrink-0 [&_button:hover]:bg-surface-hover [&_button:hover]:text-foreground flex gap-3 items-center mb-3 [&_h3]:text-sm [&_h3]:font-medium [&_h3]:m-0 [&_h3]:flex-1 [&_h3]:leading-(--text-sm--line-height)">
        <h3>
          {month.toLocaleString(dateLocale, {
            year: 'numeric',
            month: 'long',
          })}
        </h3>
        <ButtonPrimitive
          aria-label={t('dates.previousMonth')}
          disabled={Temporal.PlainYearMonth.compare(yearMonth, firstMonth) <= 0}
          onClick={() => {
            onMonthChange(month.subtract({ months: 1 }).toString());
          }}
        >
          <ChevronLeft className="size-3.5 inline-block shrink-0 align-middle" />
        </ButtonPrimitive>
        <ButtonPrimitive
          aria-label={t('dates.nextMonth')}
          disabled={Temporal.PlainYearMonth.compare(yearMonth, lastMonth) >= 0}
          onClick={() => {
            onMonthChange(month.add({ months: 1 }).toString());
          }}
        >
          <ChevronRight className="size-3.5 inline-block shrink-0 align-middle" />
        </ButtonPrimitive>
      </div>
      <div className="habit-history-grid grid grid-cols-[repeat(7,_minmax(0,_1fr))] gap-1 text-center [&_>_span]:text-xs [&_>_span]:text-muted-foreground [&_>_span]:pb-2 [&_>_span]:leading-(--text-xs--line-height) [&_button]:border [&_button]:border-transparent [&_button]:rounded-full [&_button]:[aspect-ratio:1] [&_button]:w-full [&_button]:max-w-9 [&_button]:[justify-self:center] [&_button]:bg-transparent [&_button]:text-muted-foreground [&_button]:text-xs [&_button]:p-0 [&_button]:leading-(--text-xs--line-height) [&_button:hover:not(:disabled):not(.done)]:bg-surface-hover [&_button:hover:not(:disabled):not(.done)]:text-foreground">
        {weekdayOrder.map((day) => (
          <span key={day}>{dayNames[day]}</span>
        ))}
        {monthDates(statsMonth).map((date) => {
          const day = Temporal.PlainDate.from(date);
          const log = habitLogFor(data.habitLogs, habit.id, date);

          return (
            <ButtonPrimitive
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
                'relative',
                !day.toPlainYearMonth().equals(yearMonth)
                  ? 'outside [.habit-history-grid_button&:not(.done)]:text-muted-foreground'
                  : '',
                habitDone(habit, log)
                  ? 'done [.habit-history-grid_button&]:bg-habit-color [.habit-history-grid_button&]:text-habit-on-color [.habit-history-grid_button&:hover:not(:disabled)]:bg-habit-color [.habit-history-grid_button&:hover:not(:disabled)]:text-habit-on-color [.habit-history-grid_button&:hover:not(:disabled)]:shadow-[inset_0_0_0_2px_color-mix(in_srgb,_var(--habit-on-color)_30%,_transparent)]'
                  : '',
                log?.skipped
                  ? 'skipped [.habit-history-grid_button&]:bg-transparent [.habit-history-grid_button&]:border-separator'
                  : '',
                date === logDate
                  ? 'selected [.habit-history-grid_button&]:[outline:1px_solid_var(--ring)] [.habit-history-grid_button&]:outline-offset-[1px] [.habit-weekday-select_button&]:border-link [.habit-weekday-select_button&]:[background:color-mix(in_srgb,_var(--primary)_20%,_transparent)] [.habit-weekday-select_button&]:text-link'
                  : '',
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
            </ButtonPrimitive>
          );
        })}
      </div>
      <p>{t('habits.selectDateHint')}</p>
    </div>
  );
}
