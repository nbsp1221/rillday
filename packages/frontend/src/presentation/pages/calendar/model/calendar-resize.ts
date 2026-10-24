import { Temporal } from 'temporal-polyfill/implementation';
import type { Task } from '#application';

export type CalendarResizeEdge = 'start' | 'end';

export const calendarResizeStep = 15;

export function calendarTaskRange(task: Pick<Task, 'time' | 'duration'>) {
  const time = Temporal.PlainTime.from(task.time ?? '00:00');
  const start = time.hour * 60 + time.minute;
  return { start, end: Math.min(1440, start + Math.max(calendarResizeStep, task.duration)) };
}

export function resizeCalendarTask(task: Task, edge: CalendarResizeEdge, minute: number) {
  const range = calendarTaskRange(task);
  const snapped = Math.round(minute / calendarResizeStep) * calendarResizeStep;
  const start =
    edge === 'start' ? Math.max(0, Math.min(range.end - calendarResizeStep, snapped)) : range.start;
  const end =
    edge === 'end'
      ? Math.min(1440, Math.max(range.start + calendarResizeStep, snapped))
      : range.end;
  return {
    time: calendarMinuteTime(start),
    duration: end - start,
  };
}

export function calendarMinuteTime(minute: number) {
  return Temporal.PlainTime.from('00:00')
    .add({ minutes: minute })
    .toString({ smallestUnit: 'minute' });
}
