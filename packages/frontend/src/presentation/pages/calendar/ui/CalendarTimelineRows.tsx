import { Button as ButtonPrimitive } from '@base-ui/react/button';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Plus } from 'lucide-react';
import { memo } from 'react';
import { Temporal } from 'temporal-polyfill/implementation';
import type { Task } from '#application';
import { useI18n } from '#shared/i18n';
import { CalendarTimeTasks, emptyCalendarTasks } from './CalendarTask';

export const CalendarTimelineRows = memo(function CalendarTimelineRows({
  dates,
  tasks,
  lanes,
  colors,
  scroller,
  active,
  compose,
}: {
  dates: string[];
  tasks: Map<string, Task[]>;
  lanes: Map<
    string,
    {
      lane: number;
      columns: number;
    }
  >;
  colors: Map<string, string>;
  scroller: HTMLDivElement | null;
  active: Task | null;
  compose: (date: string, time: string) => void;
}) {
  const { t, formatDate, formatTime } = useI18n();
  // oxlint-disable-next-line react/incompatible-library -- No React Compiler; TanStack/virtual#1119 tracks compatibility.
  const hours = useVirtualizer({
    count: 24,
    getScrollElement: () => scroller,
    estimateSize: () => 64,
    overscan: 2,
  });
  const visible = new Set(hours.getVirtualItems().map((row) => row.index));
  const range = hours.range;

  if (active?.time) {
    visible.add(Temporal.PlainTime.from(active.time).hour);
  }

  if (range) {
    for (const date of dates) {
      for (const task of tasks.get(date) ?? emptyCalendarTasks) {
        if (task.time) {
          const time = Temporal.PlainTime.from(task.time);
          const start = time.hour * 60 + time.minute;

          if (
            start < (range.endIndex + 3) * 60 &&
            start + task.duration > (range.startIndex - 2) * 60
          ) {
            visible.add(time.hour);
          }
        }
      }
    }
  }

  return (
    <>
      {Array.from({ length: 24 }, (_, hour) => {
        const time = Temporal.PlainTime.from({ hour }).toString({ smallestUnit: 'minute' });

        return (
          <div className="calendar-time-row contents" key={hour}>
            <span className="calendar-hour text-xs text-muted-foreground text-center pt-1 h-16 box-border leading-(--text-xs--line-height)">
              {formatTime(time)}
            </span>
            {dates.map((date) => (
              <div
                className="calendar-hour-cell h-16 min-h-16 [border-right:1px_solid_var(--grid-line)] [border-bottom:1px_solid_var(--grid-line-subtle)] p-[3px] box-border relative hover:[background:color-mix(in_srgb,_var(--popover)_35%,_transparent)]"
                data-date={date}
                data-hour={hour}
                key={date}
                onDoubleClick={(event) => {
                  if (
                    event.target instanceof Element ? event.target.closest('.calendar-task') : null
                  ) {
                    return;
                  }

                  const rect = event.currentTarget.getBoundingClientRect();
                  const minute = Math.min(
                    45,
                    Math.max(0, Math.floor((event.clientY - rect.top) / 16) * 15),
                  );
                  compose(
                    date,
                    Temporal.PlainTime.from({ hour, minute }).toString({ smallestUnit: 'minute' }),
                  );
                }}
              >
                <ButtonPrimitive
                  aria-label={t('calendar.addAtTime', {
                    date: formatDate(date),
                    time: formatTime(time),
                  })}
                  onClick={() => compose(date, time)}
                  className={
                    'calendar-slot-add z-3 border-0 bg-transparent absolute right-0.5 top-0.5 opacity-0 text-muted-foreground p-0.5 [.calendar-hour-cell:hover_&]:opacity-100 [&:focus]:opacity-100 [.calendar-view[data-dragging]_&]:invisible'
                  }
                >
                  <Plus className="size-3 inline-block shrink-0 align-middle" />
                </ButtonPrimitive>
                {visible.has(hour) && (
                  <CalendarTimeTasks
                    tasks={tasks.get(date) ?? emptyCalendarTasks}
                    hour={hour}
                    lanes={lanes}
                    colors={colors}
                  />
                )}
              </div>
            ))}
          </div>
        );
      })}
    </>
  );
});
