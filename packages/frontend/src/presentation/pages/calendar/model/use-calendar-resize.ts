import type { ResizeEvent } from '@interactjs/types';
import interact from 'interactjs';
import { useEffect, useEffectEvent, useState } from 'react';
import type { Task } from '#application';
import { useWorkspace } from '#entities/workspace';
import { useI18n } from '#shared/i18n';
import { calendarEventLayout } from './calendar-event-layout';
import { calendarMinuteTime, calendarTaskRange, resizeCalendarTask } from './calendar-resize';

export function useCalendarResize(scroller: HTMLDivElement | null, tasks: Map<string, Task[]>) {
  const { taskActions, notify } = useWorkspace();
  const { t, formatTime } = useI18n();
  const [resizing, setResizing] = useState<Task | null>(null);
  const findTask = useEffectEvent((id: string) =>
    [...tasks.values()].flat().find((task) => task.id === id),
  );
  const describe = useEffectEvent(
    (start: number, end: number) =>
      `${formatTime(calendarMinuteTime(start))}–${formatTime(calendarMinuteTime(end))} `,
  );
  const commit = useEffectEvent((task: Task, patch: ReturnType<typeof resizeCalendarTask>) => {
    if (task.time === patch.time && task.duration === patch.duration) {
      return;
    }
    if (taskActions.update(task.id, patch).status === 'applied') {
      notify(t('calendar.scheduleUpdated'), { undoable: true });
    }
  });

  useEffect(() => {
    if (!scroller) {
      return;
    }
    const grid = scroller.querySelector<HTMLElement>('.calendar-time-grid');
    if (!grid) {
      return;
    }
    let active:
      | {
          task: Task;
          element: HTMLElement;
          edge: 'start' | 'end';
          interaction: { stop: () => void };
          style: string;
          compact: boolean;
          timeText: string;
          pointerY: number;
          patch: ReturnType<typeof resizeCalendarTask>;
        }
      | undefined;

    function reset() {
      const current = active;
      active = undefined;
      if (current) {
        current.element.style.cssText = current.style;
        delete current.element.dataset.resizing;
        current.element.toggleAttribute('data-compact', current.compact);
        const time = current.element.querySelector('[data-calendar-time]');
        if (time) {
          time.textContent = current.timeText;
        }
        setResizing(null);
      }
      return current;
    }

    const preview = (pointerY: number) => {
      if (!active) {
        return;
      }
      active.pointerY = pointerY;
      const bounds = grid.getBoundingClientRect();
      const pixelsPerMinute = bounds.height / 1440;
      const patch = resizeCalendarTask(
        active.task,
        active.edge,
        (pointerY - bounds.top) / pixelsPerMinute,
      );
      const range = calendarTaskRange({ ...active.task, ...patch });
      const original = calendarTaskRange(active.task);
      const layout = calendarEventLayout(patch.duration, 1440 - range.start, pixelsPerMinute * 60);
      active.patch = patch;
      active.element.toggleAttribute('data-compact', layout.compact);
      active.element.style.height = `${layout.height}px`;
      active.element.style.setProperty('--calendar-event-lines', String(layout.lines));
      active.element.style.setProperty('--calendar-line-height', `${layout.lineHeight}px`);
      active.element.style.transform = `translateY(${(range.start - original.start) * pixelsPerMinute}px)`;
      const time = active.element.querySelector('[data-calendar-time]');
      if (time) {
        time.textContent = describe(range.start, range.end);
      }
    };

    const resizable = interact('.calendar-task.timed', { context: scroller })
      .resizable({
        edges: { top: '[data-calendar-resize="start"]', bottom: '[data-calendar-resize="end"]' },
        inertia: false,
        autoScroll: { container: scroller, margin: 40, speed: 400 },
        modifiers: [
          interact.modifiers.restrictEdges({ outer: () => grid.getBoundingClientRect() }),
        ],
        listeners: {
          start(event: ResizeEvent) {
            const element = event.target;
            if (!(element instanceof HTMLElement)) {
              return;
            }
            const task = findTask(element.dataset.taskId ?? '');
            if (!task?.time) {
              return;
            }
            active = {
              task,
              element,
              edge: event.edges?.top ? 'start' : 'end',
              interaction: event.interaction,
              style: element.style.cssText,
              compact: element.hasAttribute('data-compact'),
              timeText: element.querySelector('[data-calendar-time]')?.textContent ?? '',
              pointerY: event.clientY,
              patch: { time: task.time, duration: task.duration },
            };
            element.dataset.resizing = '';
            element.style.zIndex = '20';
            setResizing(task);
          },
          move(event: ResizeEvent) {
            preview(event.clientY);
          },
          end() {
            const current = reset();
            if (current) {
              commit(current.task, current.patch);
            }
          },
        },
      })
      .on('autoscroll', () => {
        if (active) {
          preview(active.pointerY);
        }
      });

    function cancel() {
      const current = reset();
      current?.interaction.stop();
    }

    function escape(event: KeyboardEvent) {
      if (active && event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        cancel();
      }
    }

    scroller.addEventListener('pointercancel', cancel, true);
    window.addEventListener('keydown', escape, true);
    window.addEventListener('blur', cancel);
    return () => {
      cancel();
      resizable.unset();
      scroller.removeEventListener('pointercancel', cancel, true);
      window.removeEventListener('keydown', escape, true);
      window.removeEventListener('blur', cancel);
    };
  }, [scroller]);

  return resizing;
}
