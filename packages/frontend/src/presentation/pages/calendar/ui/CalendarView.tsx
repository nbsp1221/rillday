import { Button as ButtonPrimitive } from '@base-ui/react/button';
import { cn } from 'cn';
import { Plus } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';
import { Temporal, Intl as TemporalIntl } from 'temporal-polyfill/implementation';
import type { CalendarViewMode } from '#application';
import { type Task, addDays, dateKey } from '#application';
import { useAppPreferences } from '#entities/preferences';
import { useWorkspace } from '#entities/workspace';
import { useI18n } from '#shared/i18n';
import { WorkspaceHeader } from '../../../shared/ui/WorkspaceHeader';
import { type CalendarDropTarget, useCalendarDrag } from '../model/use-calendar-drag';
import { useCalendarPeriod } from '../model/use-calendar-period';
import { useCalendarTasks } from '../model/use-calendar-tasks';
import { CalendarComposer } from './CalendarComposer';
import { CalendarDropZone } from './CalendarDropZone';
import { CalendarTaskStack, emptyCalendarTasks } from './CalendarTask';
import { CalendarTaskCapture } from './CalendarTaskCapture';
import { CalendarTimelineView } from './CalendarTimelineView';
import { CalendarToolbar } from './CalendarToolbar';
import { CalendarYearView } from './CalendarYearView';

export function CalendarView() {
  const { t, dateLocale, formatDate, formatTime } = useI18n();
  const { preferences, updatePreferences } = useAppPreferences();
  const timeLabel = formatTime;
  const { data, taskActions, notify } = useWorkspace();
  const mode = preferences.calendarView;

  const setMode = (calendarView: CalendarViewMode) => updatePreferences({ calendarView });

  const [anchor, setAnchor] = useState(() => dateKey());
  const anchorDate = Temporal.PlainDate.from(anchor);
  const anchorMonth = anchorDate.toPlainYearMonth();
  const { dates, weekdays, dayNamesForCalendar, monthDates, monthFormat, title } =
    useCalendarPeriod(anchor, mode);
  const [showUndated, setShowUndated] = useState(
    () => !window.matchMedia('(max-width: 700px)').matches,
  );
  const showCompleted = preferences.calendarShowCompleted;
  const [composer, setComposer] = useState<{
    date: string;
    time: string | null;
  } | null>(null);
  const [input, setInput] = useState('');
  const { activeTasks, taskOrder, tasksByDate, allDayTasks, listColors, eventLanes, unscheduled } =
    useCalendarTasks(data, showCompleted);
  const today = dateKey();
  const destinationFormat = useMemo(
    () =>
      new TemporalIntl.DateTimeFormat(dateLocale, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        weekday: 'short',
      }),
    [dateLocale],
  );

  function navigate(direction: number) {
    if (mode === 'month' || mode === 'agenda' || mode === 'year') {
      const date = Temporal.PlainDate.from(anchor).with({ day: 1 });
      const duration = mode === 'year' ? { years: direction } : { months: direction };
      setAnchor(date.add(duration).toString());
    } else {
      setAnchor(addDays(anchor, direction * (mode === 'week' ? 7 : 1)));
    }
  }

  const drag = useCalendarDrag(activeTasks, mode, (task, target) => {
    const result = taskActions.schedule(task.id, target);

    if (result.status !== 'applied') {
      return;
    }

    const nextTime = result.value.time;
    notify(
      target.date
        ? t('calendar.movedToDate', {
            date: `${formatDate(target.date)}${nextTime ? ` ${timeLabel(nextTime)}` : ''}`,
          })
        : t('calendar.dateRemoved'),
      { undoable: true },
    );
  });

  function destination(target: CalendarDropTarget) {
    if (!target.date) {
      return t(drag.task?.repeat ? 'calendar.dropClearRecurrence' : 'calendar.dropClearSchedule');
    }

    const time = target.time === undefined ? drag.task?.time : target.time;
    const day = destinationFormat.format(Temporal.PlainDate.from(target.date));

    return t('calendar.dropOnDate', {
      date: t('dates.dateAndTime', {
        date: day,
        time: time ? timeLabel(time) : t('calendar.allDay'),
      }),
    });
  }

  function pendingTask(kind: 'date' | 'all-day' | 'undated', date: string | null) {
    return drag.task && drag.target?.kind === kind && drag.target.date === date
      ? { ...drag.task, date, time: kind === 'date' ? drag.task.time : null }
      : null;
  }

  function taskStack(tasks: Task[], kind: 'date' | 'all-day' | 'undated', date: string | null) {
    return (
      <CalendarTaskStack
        tasks={tasks}
        pending={pendingTask(kind, date)}
        dated={kind === 'date'}
        order={taskOrder}
        colors={listColors}
        virtualize={mode === 'month' && kind === 'date'}
      />
    );
  }

  const openComposer = useCallback(
    (date: string, time: string | null = null) => {
      setComposer({ date, time });
      setInput('');
    },
    [setComposer, setInput],
  );

  return (
    <section
      className="calendar-view [--calendar-inset:20px] h-full flex flex-col min-w-0 bg-background text-foreground [&_button]:text-inherit [@media(max-width:_899px)]:[--calendar-inset:16px] relative [&_[data-calendar-drop][data-drop-active='true']]:opacity-100 [&_[data-calendar-drop][data-drop-active='true']]:[background:color-mix(in_srgb,_var(--link)_14%,_var(--background))]"
      data-dragging={Boolean(drag.task) || undefined}
      {...drag.handlers}
    >
      <WorkspaceHeader title={t('area.calendar', { ns: 'labels' })} />
      <CalendarToolbar
        title={title}
        onToday={() => setAnchor(today)}
        navigate={navigate}
        showUndated={showUndated}
        setShowUndated={setShowUndated}
      />
      <div className="calendar-body [@media(max-width:_700px)]:flex-col flex min-h-0 flex-1">
        <div className="calendar-main [container-type:inline-size] min-w-0 flex-1 flex flex-col overflow-hidden">
          {mode === 'year' ? (
            <CalendarYearView
              anchor={anchor}
              today={today}
              weekdays={weekdays}
              monthDates={monthDates}
              monthFormat={monthFormat}
              tasksByDate={tasksByDate}
              onNavigate={(date, mode) => {
                setAnchor(date);
                setMode(mode);
              }}
            />
          ) : mode === 'agenda' ? (
            <div className="calendar-agenda overflow-auto [&::-webkit-scrollbar]:size-[7px] [&::-webkit-scrollbar-thumb]:rounded-lg [&::-webkit-scrollbar-thumb]:bg-scrollbar [&::-webkit-scrollbar-thumb:hover]:bg-scrollbar-hover py-4 px-(--calendar-inset)">
              {Array.from(
                {
                  length: anchorDate.daysInMonth,
                },
                (_, i) => anchorDate.with({ day: i + 1 }),
              ).map((day) => {
                const date = day.toString();
                const tasks = tasksByDate.get(date) ?? emptyCalendarTasks;

                return (
                  <CalendarDropZone
                    kind="date"
                    date={date}
                    key={date}
                    className={cn(
                      'calendar-agenda-day flex gap-5 [border-bottom:1px_solid_var(--grid-line)] py-[13px] px-0 min-h-[45px] [&_>_div]:w-10 [&_>_div]:shrink-0 [&_>_div]:flex [&_>_div]:items-center [&_>_div]:flex-col [&_>_div]:gap-[5px] [&_>_div_strong]:text-xl [&_>_div_strong]:font-normal [&_>_div_strong]:leading-(--text-xl--line-height) [&_>_div_span]:text-xs [&_>_div_span]:text-muted-foreground [&_>_div_span]:leading-(--text-xs--line-height) [&_>_section]:flex-1 [&_>_section]:relative [&_>_section]:flex [&_>_section]:flex-col [&_>_section]:gap-[5px] [&_>_section]:pr-5.5 relative',
                      date === today
                        ? 'today [.calendar-day-head_button&]:text-primary-foreground [.calendar-day-head_button&]:bg-primary [.calendar-time-head_>_button&_strong]:bg-primary [.calendar-time-head_>_button&_strong]:rounded-full [.calendar-time-head_>_button&_strong]:w-7 [.calendar-time-head_>_button&_strong]:h-7 [.calendar-time-head_>_button&_strong]:flex [.calendar-time-head_>_button&_strong]:items-center [.calendar-time-head_>_button&_strong]:justify-center [.calendar-time-head_>_button&_strong]:text-primary-foreground [.calendar-mini-month_button&]:bg-primary [.calendar-mini-month_button&]:text-primary-foreground [&_>_div_strong]:text-link'
                        : '',
                    )}
                  >
                    <div>
                      <strong>{day.day}</strong>
                      <span>{dayNamesForCalendar(date)}</span>
                    </div>
                    <section>
                      {taskStack(tasks, 'date', date)}
                      {!tasks.length && !pendingTask('date', date) && (
                        <span className="calendar-agenda-free text-xs text-muted-foreground pt-3.5 opacity-60 leading-(--text-xs--line-height)">
                          {t('calendar.empty')}
                        </span>
                      )}
                      <ButtonPrimitive
                        aria-label={t('calendar.addScheduledTask', { date: formatDate(date) })}
                        onClick={() => openComposer(date)}
                        className={
                          'calendar-agenda-add absolute right-0 top-2.5 border-0 [background:none] text-muted-foreground p-0.5 flex opacity-0 [.calendar-agenda-day:hover_&]:opacity-100 [.calendar-agenda-day:focus-within_&]:opacity-100 [.calendar-view[data-dragging]_&]:invisible'
                        }
                      >
                        <Plus className="size-3.5 inline-block shrink-0 align-middle" />
                      </ButtonPrimitive>
                    </section>
                  </CalendarDropZone>
                );
              })}
            </div>
          ) : mode === 'month' ? (
            <>
              <div className="calendar-weekdays grid grid-cols-[repeat(7,_minmax(0,_1fr))] h-8.5 [border-bottom:1px_solid_var(--grid-line)] shrink-0 [&_span]:text-xs [&_span]:text-muted-foreground [&_span]:flex [&_span]:items-center [&_span]:justify-end [&_span]:pr-3.5 [&_span]:leading-(--text-xs--line-height)">
                {weekdays.map((day) => (
                  <span key={day}>{day}</span>
                ))}
              </div>
              <div className="calendar-month-grid grid grid-cols-[repeat(7,_minmax(0,_1fr))] grid-rows-[repeat(6,_minmax(94px,_1fr))] flex-1 overflow-auto [&::-webkit-scrollbar]:size-[7px] [&::-webkit-scrollbar-thumb]:rounded-lg [&::-webkit-scrollbar-thumb]:bg-scrollbar [&::-webkit-scrollbar-thumb:hover]:bg-scrollbar-hover [@media(max-width:_700px)]:grid-rows-[repeat(6,_minmax(90px,_1fr))]">
                {dates.map((date) => {
                  const day = Temporal.PlainDate.from(date);

                  return (
                    <CalendarDropZone
                      kind="date"
                      date={date}
                      key={date}
                      className={cn(
                        'calendar-day [border-right:1px_solid_var(--grid-line)] [border-bottom:1px_solid_var(--grid-line)] py-[5px] px-1 min-w-0 overflow-auto [&::-webkit-scrollbar]:size-[7px] [&::-webkit-scrollbar-thumb]:rounded-lg [&::-webkit-scrollbar-thumb]:bg-scrollbar [&::-webkit-scrollbar-thumb:hover]:bg-scrollbar-hover [&:nth-child(7n)]:[border-right:0] relative',
                        !day.toPlainYearMonth().equals(anchorMonth)
                          ? 'outside bg-surface-inset [.calendar-mini-month_button&]:opacity-25'
                          : '',
                      )}
                      onDoubleClick={(event) => {
                        if ((event.target as HTMLElement).closest('button')) {
                          return;
                        }

                        openComposer(date);
                      }}
                    >
                      <div className="calendar-day-head [.calendar-day.outside_&_>_button:first-child]:text-muted-foreground [.calendar-day.outside_&_>_button:first-child]:opacity-50 flex items-center justify-between [flex-direction:row-reverse] mb-1 h-6 [&_button]:border-0 [&_button]:bg-transparent [&_button]:text-xs [&_button]:w-6 [&_button]:h-6 [&_button]:rounded-full [&_button]:p-0 [&_button]:leading-(--text-xs--line-height)">
                        <ButtonPrimitive
                          title={t('calendar.showDate', { date: formatDate(date) })}
                          onClick={() => {
                            setAnchor(date);
                            setMode('day');
                          }}
                          className={cn(
                            date === today
                              ? 'today [.calendar-day-head_button&]:text-primary-foreground [.calendar-day-head_button&]:bg-primary [.calendar-time-head_>_button&_strong]:bg-primary [.calendar-time-head_>_button&_strong]:rounded-full [.calendar-time-head_>_button&_strong]:w-7 [.calendar-time-head_>_button&_strong]:h-7 [.calendar-time-head_>_button&_strong]:flex [.calendar-time-head_>_button&_strong]:items-center [.calendar-time-head_>_button&_strong]:justify-center [.calendar-time-head_>_button&_strong]:text-primary-foreground [.calendar-mini-month_button&]:bg-primary [.calendar-mini-month_button&]:text-primary-foreground'
                              : '',
                          )}
                        >
                          {day.day}
                        </ButtonPrimitive>
                        <ButtonPrimitive
                          aria-label={t('calendar.addTaskOnDate', { date: formatDate(date) })}
                          onClick={() => openComposer(date)}
                          className={
                            'calendar-day-add opacity-0 flex items-center justify-center text-muted-foreground [.calendar-day:hover_&]:opacity-100 [.calendar-day:focus-within_&]:opacity-100 [.calendar-view[data-dragging]_&]:invisible'
                          }
                        >
                          <Plus className="size-3.5 inline-block shrink-0 align-middle" />
                        </ButtonPrimitive>
                      </div>
                      <div className="calendar-day-tasks flex flex-col gap-[3px]">
                        {taskStack(tasksByDate.get(date) ?? emptyCalendarTasks, 'date', date)}
                      </div>
                    </CalendarDropZone>
                  );
                })}
              </div>
            </>
          ) : (
            <CalendarTimelineView
              dates={dates}
              today={today}
              tasksByDate={tasksByDate}
              allDayTasks={allDayTasks}
              eventLanes={eventLanes}
              listColors={listColors}
              drag={drag}
              onNavigateDay={(date) => {
                setAnchor(date);
                setMode('day');
              }}
              openComposer={openComposer}
              renderAllDay={(tasks, date) => taskStack(tasks, 'all-day', date)}
            />
          )}
        </div>
        {showUndated && (
          <CalendarDropZone
            as="aside"
            kind="undated"
            date={null}
            className="calendar-undated [@media(max-width:_700px)]:[.calendar-body_&]:block [@media(max-width:_700px)]:[.calendar-body_&]:w-full [@media(max-width:_700px)]:[.calendar-body_&]:max-h-[40%] [@media(max-width:_700px)]:[.calendar-body_&]:[border-left:0] [@media(max-width:_700px)]:[.calendar-body_&]:[border-top:1px_solid_var(--separator)] w-58.5 m-0 border-0 [border-left:1px_solid_var(--separator)] bg-background p-(--layout-card-inset) overflow-auto [&::-webkit-scrollbar]:size-[7px] [&::-webkit-scrollbar-thumb]:rounded-lg [&::-webkit-scrollbar-thumb]:bg-scrollbar [&::-webkit-scrollbar-thumb:hover]:bg-scrollbar-hover shrink-0 [&_h2]:flex [&_h2]:items-center [&_h2]:gap-2 [&_h2]:text-sm [&_h2]:font-medium [&_h2]:[margin:0_0_7px] [&_h2]:leading-(--text-sm--line-height) [&_h2_span]:text-muted-foreground [&_h2_span]:text-xs [&_h2_span]:leading-(--text-xs--line-height) [&_>_p]:text-xs [&_>_p]:text-muted-foreground [&_>_p]:mb-5 [&_>_p]:leading-(--text-xs--line-height) [@media(max-width:_1000px)]:w-47.5 relative"
          >
            <h2>
              {t('calendar.undatedTasks')}
              <span>{unscheduled.length}</span>
            </h2>
            <p className="mt-3">{t('calendar.scheduleHint')}</p>
            {taskStack(unscheduled, 'undated', null)}
            {!unscheduled.length && !pendingTask('undated', null) && (
              <div className="calendar-empty text-muted-foreground text-sm text-center py-7.5 px-0 leading-(--text-sm--line-height)">
                {t('calendar.undatedEmpty')}
              </div>
            )}
            <CalendarTaskCapture />
          </CalendarDropZone>
        )}
      </div>
      <div
        className="calendar-drag-status task-drag-announcement fixed top-0 left-0 w-[1px] h-[1px] overflow-hidden [clip-path:inset(50%)] whitespace-nowrap"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {drag.task && drag.target ? `${drag.task.title}. ${destination(drag.target)}` : ''}
      </div>
      {composer && (
        <CalendarComposer
          composer={composer}
          input={input}
          setInput={setInput}
          close={() => setComposer(null)}
        />
      )}
    </section>
  );
}
