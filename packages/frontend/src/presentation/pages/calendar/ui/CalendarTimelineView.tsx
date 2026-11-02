import { Button as ButtonPrimitive } from '@base-ui/react/button';
import { cn } from 'cn';
import { Plus } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { Temporal, Intl as TemporalIntl } from 'temporal-polyfill/implementation';
import type { Task } from '#application';
import { useI18n } from '#shared/i18n';
import type { CalendarDropTarget } from '../model/use-calendar-drag';
import { useCalendarResize } from '../model/use-calendar-resize';
import { CalendarDropZone } from './CalendarDropZone';
import { emptyCalendarTasks } from './CalendarTask';
import { CalendarTimelineRows } from './CalendarTimelineRows';

interface CalendarTimelineViewProps {
  dates: string[];
  today: string;
  tasksByDate: Map<string, Task[]>;
  allDayTasks: Map<string, Task[]>;
  eventLanes: Map<
    string,
    {
      lane: number;
      columns: number;
    }
  >;
  listColors: Map<string, string>;
  drag: {
    task: Task | null;
    target: CalendarDropTarget | null;
  };
  onNavigateDay: (date: string) => void;
  openComposer: (date: string, time?: string | null) => void;
  renderAllDay: (tasks: Task[], date: string) => ReactNode;
}

export function CalendarTimelineView({
  dates,
  today,
  tasksByDate,
  allDayTasks,
  eventLanes,
  listColors,
  drag,
  onNavigateDay,
  openComposer,
  renderAllDay,
}: CalendarTimelineViewProps) {
  const { t, dateLocale, formatDate, formatTime: timeLabel } = useI18n();
  const [timeElement, setTimeElement] = useState<HTMLDivElement | null>(null);
  const resizing = useCalendarResize(timeElement, tasksByDate);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const focusedTask =
    [...tasksByDate.values()].flat().find((task) => task.id === focusedId) ?? null;
  const dayFormat = new TemporalIntl.DateTimeFormat(dateLocale, { weekday: 'short' });

  const dayNamesForCalendar = (date: string) => dayFormat.format(Temporal.PlainDate.from(date));

  return (
    <div
      className="calendar-timeline flex flex-col min-h-0 flex-1 overflow-x-auto [&::-webkit-scrollbar]:size-[7px] [&::-webkit-scrollbar-thumb]:rounded-lg [&::-webkit-scrollbar-thumb]:bg-scrollbar [&::-webkit-scrollbar-thumb:hover]:bg-scrollbar-hover"
      style={{ '--calendar-timeline-min': `${52 + dates.length * 90}px` }}
    >
      <div
        className="calendar-time-head grid shrink-0 [border-bottom:1px_solid_var(--grid-line)] min-w-[calc(var(--calendar-timeline-min)_+_var(--scrollbar-size))] h-17 pr-(--scrollbar-size) [&_>_button]:border-0 [&_>_button]:bg-transparent [&_>_button]:flex [&_>_button]:items-center [&_>_button]:justify-center [&_>_button]:flex-col [&_>_button]:gap-1.5 [&_>_button_span]:text-xs [&_>_button_span]:text-muted-foreground [&_>_button_span]:leading-(--text-xs--line-height) [&_>_button_strong]:text-base [&_>_button_strong]:font-normal [&_>_button_strong]:leading-(--text-base--line-height)"
        style={{ gridTemplateColumns: `52px repeat(${dates.length}, minmax(90px, 1fr))` }}
      >
        <span />
        {dates.map((date) => (
          <ButtonPrimitive
            key={date}
            onClick={() => {
              onNavigateDay(date);
            }}
            className={cn(
              date === today
                ? 'today [.calendar-day-head_button&]:text-primary-foreground [.calendar-day-head_button&]:bg-primary [.calendar-time-head_>_button&_strong]:bg-primary [.calendar-time-head_>_button&_strong]:rounded-full [.calendar-time-head_>_button&_strong]:w-7 [.calendar-time-head_>_button&_strong]:h-7 [.calendar-time-head_>_button&_strong]:flex [.calendar-time-head_>_button&_strong]:items-center [.calendar-time-head_>_button&_strong]:justify-center [.calendar-time-head_>_button&_strong]:text-primary-foreground [.calendar-mini-month_button&]:bg-primary [.calendar-mini-month_button&]:text-primary-foreground'
                : '',
            )}
          >
            <span>{dayNamesForCalendar(date)}</span>
            <strong>{Temporal.PlainDate.from(date).day}</strong>
          </ButtonPrimitive>
        ))}
      </div>
      <div
        className="calendar-all-day grid shrink-0 [border-bottom:1px_solid_var(--grid-line)] min-w-[calc(var(--calendar-timeline-min)_+_var(--scrollbar-size))] min-h-10.5 max-h-45 overflow-auto [&::-webkit-scrollbar]:size-[7px] [&::-webkit-scrollbar-thumb]:rounded-lg [&::-webkit-scrollbar-thumb]:bg-scrollbar [&::-webkit-scrollbar-thumb:hover]:bg-scrollbar-hover [scrollbar-gutter:stable] [&_>_span]:text-xs [&_>_span]:text-muted-foreground [&_>_span]:py-3 [&_>_span]:px-[5px] [&_>_span]:text-center [&_>_span]:leading-(--text-xs--line-height) [&_>_div]:[border-right:1px_solid_var(--grid-line)] [&_>_div]:p-1 [&_>_div]:relative [&_>_div]:min-h-[35px]"
        style={{ gridTemplateColumns: `52px repeat(${dates.length}, minmax(90px, 1fr))` }}
      >
        <span>{t('calendar.allDay')}</span>
        {dates.map((date) => (
          <CalendarDropZone
            kind="all-day"
            date={date}
            key={date}
            onDoubleClick={(event) => {
              if (
                event.target instanceof Element
                  ? event.target.closest('button, .calendar-task')
                  : null
              ) {
                return;
              }

              openComposer(date);
            }}
          >
            {renderAllDay(allDayTasks.get(date) ?? emptyCalendarTasks, date)}
            <ButtonPrimitive
              aria-label={t('calendar.addAllDayTask', { date: formatDate(date) })}
              onClick={() => openComposer(date)}
              className={
                'calendar-all-day-add border-0 bg-transparent text-muted-foreground [float:right] opacity-0 [.calendar-all-day_>_div:hover_&]:opacity-100 [.calendar-view[data-dragging]_&]:invisible'
              }
            >
              <Plus className="size-3.5 inline-block shrink-0 align-middle" />
            </ButtonPrimitive>
          </CalendarDropZone>
        ))}
      </div>
      <div
        ref={setTimeElement}
        onFocusCapture={(event) =>
          setFocusedId(
            (event.target instanceof Element
              ? event.target.closest<HTMLElement>('[data-task-id]')
              : null
            )?.dataset.taskId ?? null,
          )
        }
        onBlurCapture={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) {
            setFocusedId(null);
          }
        }}
        className="calendar-time-scroll overflow-auto [&::-webkit-scrollbar]:size-[7px] [&::-webkit-scrollbar-thumb]:rounded-lg [&::-webkit-scrollbar-thumb]:bg-scrollbar [&::-webkit-scrollbar-thumb:hover]:bg-scrollbar-hover [scrollbar-gutter:stable] flex-1 min-h-0 min-w-[calc(var(--calendar-timeline-min)_+_var(--scrollbar-size))]"
      >
        <CalendarDropZone
          kind="time"
          date={null}
          dates={dates}
          className="calendar-time-grid grid isolate min-w-(--calendar-timeline-min) relative"
          style={{ gridTemplateColumns: `52px repeat(${dates.length}, minmax(90px, 1fr))` }}
        >
          <CalendarTimelineRows
            dates={dates}
            tasks={tasksByDate}
            lanes={eventLanes}
            colors={listColors}
            scroller={timeElement}
            active={drag.task ?? resizing ?? focusedTask}
            compose={openComposer}
          />
          {drag.task && drag.target?.kind === 'time' && (
            <div
              className="calendar-drop-preview shrink-0 min-w-0 [outline:1px_dashed_var(--link)] outline-offset-[-1px] rounded-sm text-foreground text-xs leading-(--text-xs--line-height) overflow-hidden pointer-events-none select-none calendar-time-preview absolute z-4 flex items-start gap-1.5 py-1 px-1.5 [background:color-mix(in_srgb,_var(--link)_12%,_var(--background))] [&_>_strong]:shrink-0 [&_>_strong]:font-medium [&_>_span]:overflow-hidden [&_>_span]:text-ellipsis [&_>_span]:whitespace-nowrap"
              data-date={drag.target.date}
              data-time={drag.target.time}
              aria-hidden="true"
              style={{
                left: drag.target.left,
                width: drag.target.width,
                top: (drag.target.minutes / 60) * drag.target.hourHeight,
                height: Math.min(
                  ((1440 - drag.target.minutes) / 60) * drag.target.hourHeight,
                  Math.max(
                    14,
                    (Math.max(15, drag.task.duration) / 60) * drag.target.hourHeight - 2,
                  ),
                ),
              }}
            >
              <strong>{timeLabel(drag.target.time)}</strong>
              <span>{drag.task.title}</span>
            </div>
          )}
        </CalendarDropZone>
      </div>
    </div>
  );
}
