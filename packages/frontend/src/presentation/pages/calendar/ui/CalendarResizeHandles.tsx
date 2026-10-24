import { Button as ButtonPrimitive } from '@base-ui/react/button';
import type { Task } from '#application';
import { useWorkspace } from '#entities/workspace';
import { useI18n } from '#shared/i18n';
import {
  calendarMinuteTime,
  calendarResizeStep,
  calendarTaskRange,
  resizeCalendarTask,
} from '../model/calendar-resize';

export function CalendarResizeHandles({ task }: { task: Task }) {
  const { t, formatTime } = useI18n();
  const { taskActions } = useWorkspace();
  const range = calendarTaskRange(task);

  return (['start', 'end'] as const).map((edge) => {
    const value = range[edge];
    const minimum = edge === 'start' ? 0 : range.start + calendarResizeStep;
    const maximum = edge === 'end' ? 1440 : range.end - calendarResizeStep;

    return (
      <ButtonPrimitive
        key={edge}
        role="slider"
        data-calendar-resize={edge}
        aria-label={t(edge === 'start' ? 'calendar.adjustStart' : 'calendar.adjustEnd')}
        aria-orientation="vertical"
        aria-valuemin={minimum}
        aria-valuemax={maximum}
        aria-valuenow={value}
        aria-valuetext={formatTime(calendarMinuteTime(value))}
        onKeyDown={(event) => {
          const direction = ['ArrowUp', 'ArrowRight'].includes(event.key)
            ? 1
            : ['ArrowDown', 'ArrowLeft'].includes(event.key)
              ? -1
              : 0;

          if (!direction && event.key !== 'Home' && event.key !== 'End') {
            return;
          }

          event.preventDefault();
          event.stopPropagation();
          const minute =
            event.key === 'Home'
              ? minimum
              : event.key === 'End'
                ? maximum
                : value + direction * calendarResizeStep;
          taskActions.update(task.id, resizeCalendarTask(task, edge, minute));
          // Crossing an hour moves the event into another virtualized row.
          requestAnimationFrame(() => {
            document
              .querySelector<HTMLElement>(
                `[data-task-id="${CSS.escape(task.id)}"] [data-calendar-resize="${edge}"]`,
              )
              ?.focus();
          });
        }}
        className={
          'absolute inset-x-0 z-10 h-1 cursor-ns-resize touch-none rounded-none bg-transparent p-0 hover:bg-transparent focus-visible:outline-1 focus-visible:outline-ring focus-visible:-outline-offset-1 data-[calendar-resize=start]:top-0 data-[calendar-resize=end]:bottom-0'
        }
      />
    );
  });
}
