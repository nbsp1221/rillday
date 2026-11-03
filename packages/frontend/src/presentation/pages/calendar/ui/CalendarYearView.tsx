import { Button as ButtonPrimitive } from '@base-ui/react/button';
import { cn } from 'cn';
import { Temporal, type Intl as TemporalIntl } from 'temporal-polyfill/implementation';
import type { Task } from '#application';
import { useI18n } from '#shared/i18n';
import { CalendarDropZone } from './CalendarDropZone';

export function CalendarYearView({
  anchor,
  today,
  weekdays,
  monthDates,
  monthFormat,
  tasksByDate,
  onNavigate,
}: {
  anchor: string;
  today: string;
  weekdays: string[];
  monthDates: (date: string) => string[];
  monthFormat: TemporalIntl.DateTimeFormat;
  tasksByDate: ReadonlyMap<string, Task[]>;
  onNavigate: (date: string, mode: 'day' | 'month') => void;
}) {
  const { t, formatDate } = useI18n();
  const anchorDate = Temporal.PlainDate.from(anchor);

  return (
    <div className="calendar-year-grid py-4 px-(--calendar-inset) grid grid-cols-[repeat(3,_minmax(0,_1fr))] gap-4 overflow-auto [&::-webkit-scrollbar]:size-[7px] [&::-webkit-scrollbar-thumb]:rounded-lg [&::-webkit-scrollbar-thumb]:bg-scrollbar [&::-webkit-scrollbar-thumb:hover]:bg-scrollbar-hover [@container((max-width:_700px))]:grid-cols-[repeat(2,_minmax(0,_1fr))] [@container((max-width:_400px))]:grid-cols-[minmax(0,_1fr)]">
      {Array.from({ length: 12 }, (_, month) => {
        const monthDate = anchorDate.with({ month: month + 1, day: 1 });
        const yearMonth = monthDate.toPlainYearMonth();
        const key = monthDate.toString();

        return (
          <div
            className="calendar-mini-month [&_>_div]:grid [&_>_div]:grid-cols-[repeat(7,_1fr)] [&_>_div]:gap-1 [&_>_div]:text-center [&_span]:text-xs [&_span]:text-muted-foreground [&_span]:mb-[7px] [&_span]:leading-(--text-xs--line-height) [&_>_div_button]:bg-transparent [&_>_div_button]:border-0 [&_>_div_button]:[aspect-ratio:1] [&_>_div_button]:text-xs [&_>_div_button]:rounded-full [&_>_div_button]:relative [&_>_div_button]:p-0 [&_>_div_button]:max-h-7.5 [&_>_div_button]:leading-(--text-xs--line-height) [&_button:hover]:bg-popover"
            key={key}
          >
            <ButtonPrimitive
              onClick={() => {
                onNavigate(key, 'month');
              }}
              className={
                'calendar-mini-title text-sm font-medium mb-[15px] border-0 [background:none] p-0 leading-(--text-sm--line-height)'
              }
            >
              {monthFormat.format(monthDate)}
            </ButtonPrimitive>
            <div>
              {weekdays.map((day) => (
                <span key={day}>{day}</span>
              ))}
              {monthDates(key).map((date) => {
                const day = Temporal.PlainDate.from(date);

                return (
                  <CalendarDropZone
                    as="button"
                    kind="date"
                    date={date}
                    dropId={`${key}:${date}`}
                    key={date}
                    title={t('calendar.dateTaskCount', {
                      date: formatDate(date),
                      count: tasksByDate.get(date)?.length ?? 0,
                    })}
                    onClick={() => {
                      onNavigate(date, 'day');
                    }}
                    className={cn(
                      !day.toPlainYearMonth().equals(yearMonth)
                        ? 'outside [.calendar-mini-month_button&]:text-muted-foreground'
                        : '',
                      date === today
                        ? 'today [.calendar-day-head_button&]:text-primary-foreground [.calendar-day-head_button&]:bg-primary [.calendar-time-head_>_button&_strong]:bg-primary [.calendar-time-head_>_button&_strong]:rounded-full [.calendar-time-head_>_button&_strong]:w-7 [.calendar-time-head_>_button&_strong]:h-7 [.calendar-time-head_>_button&_strong]:flex [.calendar-time-head_>_button&_strong]:items-center [.calendar-time-head_>_button&_strong]:justify-center [.calendar-time-head_>_button&_strong]:text-primary-foreground [.calendar-mini-month_button&]:bg-primary [.calendar-mini-month_button&]:text-primary-foreground'
                        : '',
                      tasksByDate.has(date)
                        ? "has-tasks [.calendar-mini-month_button&:after]:[content:''] [.calendar-mini-month_button&:after]:absolute [.calendar-mini-month_button&:after]:bottom-0.5 [.calendar-mini-month_button&:after]:left-[calc(50%_-_1.5px)] [.calendar-mini-month_button&:after]:w-[3px] [.calendar-mini-month_button&:after]:h-[3px] [.calendar-mini-month_button&:after]:rounded-full [.calendar-mini-month_button&:after]:bg-primary"
                        : '',
                    )}
                  >
                    {day.day}
                  </CalendarDropZone>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
