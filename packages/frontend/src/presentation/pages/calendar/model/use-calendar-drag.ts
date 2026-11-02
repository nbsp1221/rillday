import { type DragMoveEvent, useDragDropManager, useDragDropMonitor } from '@dnd-kit/react';
import { useEffect, useRef, useState } from 'react';
import { Temporal } from 'temporal-polyfill/implementation';
import { type Task, dateSchema } from '#application';

export type CalendarDropTarget = {
  id: string;
  time?: string | null;
  minutes?: number;
  left?: number;
  width?: number;
  hourHeight?: number;
} & (
  | { kind: 'undated'; date: null }
  | { kind: 'date' | 'all-day'; date: string }
  | {
      kind: 'time';
      date: string;
      time: string;
      minutes: number;
      left: number;
      width: number;
      hourHeight: number;
    }
);

function calendarDate(value: unknown): value is string {
  return dateSchema.safeParse(value).success;
}

function locateTarget(
  drop: DragMoveEvent['operation']['target'] | undefined,
  x: number,
  y: number,
  grabbedMinutes = 0,
): CalendarDropTarget | null {
  const bounds = drop?.shape?.boundingRectangle;
  if (
    !drop ||
    !bounds ||
    x < bounds.left ||
    x >= bounds.right ||
    y < bounds.top ||
    y >= bounds.bottom
  ) {
    return null;
  }
  const kind: unknown = drop.data.kind;
  const date: unknown = drop.data.date;
  if (kind === 'undated' && date === null) {
    return { id: String(drop.id), kind, date };
  }
  if ((kind === 'date' || kind === 'all-day') && calendarDate(date)) {
    return { id: String(drop.id), kind, date, ...(kind === 'all-day' ? { time: null } : {}) };
  }

  // Other consumers share the provider, including sidebar list/completion targets.
  const values: unknown = drop.data.dates;
  if (kind !== 'time' || !Array.isArray(values) || !values.length) {
    return null;
  }
  const dates = (values as unknown[]).filter(calendarDate);
  if (
    dates.length !== values.length ||
    !Number.isFinite(bounds.width) ||
    !Number.isFinite(bounds.height) ||
    bounds.width <= 56 ||
    bounds.height <= 0
  ) {
    return null;
  }
  // The library owns measured geometry; task scheduling maps it to fifteen-minute slots.
  const hourHeight = bounds.height / 24;
  const width = (bounds.width - 52) / dates.length;
  const index = Math.floor((x - bounds.left - 52) / width);
  const targetDate = dates[index];
  if (index < 0 || index >= dates.length || targetDate === undefined) {
    return null;
  }
  const pointerMinutes = ((y - bounds.top) / hourHeight) * 60 - grabbedMinutes;
  const minutes = Math.min(1425, Math.max(0, Math.floor((pointerMinutes + 0.000001) / 15) * 15));
  const time = Temporal.PlainTime.from('00:00')
    .add({ minutes })
    .toString({ smallestUnit: 'minute' });

  return {
    id: `time:${targetDate}:${time}`,
    kind,
    date: targetDate,
    time,
    minutes,
    left: 52 + index * width + 2,
    width: width - 4,
    hourHeight,
  };
}

export function useCalendarDrag(
  tasks: Task[],
  identity: string,
  move: (task: Task, target: CalendarDropTarget) => void,
) {
  const pointRef = useRef<{ x: number; y: number } | null>(null);
  const grabbedMinutesRef = useRef(0);
  const manager = useDragDropManager();
  const [taskId, setTaskId] = useState<string | null>(null);
  const [target, setTarget] = useState<CalendarDropTarget | null>(null);
  const task = tasks.find((item) => item.id === taskId) ?? null;

  function end() {
    pointRef.current = null;
    grabbedMinutesRef.current = 0;
    setTaskId(null);
    setTarget(null);
  }

  function resolve(x: number, y: number) {
    pointRef.current = { x, y };
    return locateTarget(manager?.dragOperation.target, x, y, grabbedMinutesRef.current);
  }

  function show(next: CalendarDropTarget | null) {
    setTarget((current) =>
      current?.id === next?.id &&
      current?.left === next?.left &&
      current?.width === next?.width &&
      current?.hourHeight === next?.hourHeight
        ? current
        : next,
    );
  }

  useDragDropMonitor({
    onDragStart(event) {
      const id: unknown = event.operation.source?.data.taskId;
      if (typeof id === 'string') {
        const element = event.operation.source?.element;
        // Drag feedback can reparent the source before this callback runs.
        const grid = element?.ownerDocument.querySelector('.calendar-time-grid');
        const gridBounds = grid?.getBoundingClientRect();
        const item = tasks.find((task) => task.id === id);
        const time = item?.time ? Temporal.PlainTime.from(item.time) : null;
        grabbedMinutesRef.current =
          gridBounds && time && element?.matches('.calendar-task.timed')
            ? ((event.operation.position.initial.y - gridBounds.top) / gridBounds.height) * 1440 -
              (time.hour * 60 + time.minute)
            : 0;
        setTaskId(id);
        const p = event.operation.position.current;
        show(resolve(p.x, p.y));
      }
    },
    onDragOver(event) {
      const p = event.operation.position.current;
      show(resolve(p.x, p.y));
    },
    onDragMove(event) {
      if (event.defaultPrevented) {
        return;
      }
      const current = event.operation.position.current;
      const p = event.to ?? {
        x: current.x + (event.by?.x ?? 0),
        y: current.y + (event.by?.y ?? 0),
      };
      show(resolve(p.x, p.y));
    },
    onDragEnd(event) {
      const id: unknown = event.operation.source?.data.taskId;
      const item = tasks.find((item) => item.id === id);
      const p = event.operation.position.current;
      const next = locateTarget(event.operation.target, p.x, p.y, grabbedMinutesRef.current);
      if (!event.canceled && item && next) {
        move(item, next);
      }
      end();
    },
  });
  useEffect(() => {
    manager?.actions.stop({ canceled: true });
  }, [identity, manager?.actions]);
  useEffect(() => {
    if (taskId && !task) {
      manager?.actions.stop({ canceled: true });
    }
  }, [taskId, task, manager?.actions]);
  const scrollFrameRef = useRef<number | null>(null);
  const scrollersRef = useRef(new Set<Element>());
  useEffect(
    () => () => {
      if (scrollFrameRef.current !== null) {
        cancelAnimationFrame(scrollFrameRef.current);
      }
    },
    [],
  );
  const handlers = {
    onScrollCapture(event: React.UIEvent<HTMLElement>) {
      if (!pointRef.current) {
        return;
      }
      if (event.target instanceof Element) {
        scrollersRef.current.add(event.target);
      }
      if (scrollFrameRef.current !== null) {
        return;
      }
      scrollFrameRef.current = requestAnimationFrame(() => {
        scrollFrameRef.current = null;
        const changed = [...scrollersRef.current];
        scrollersRef.current.clear();
        if (!pointRef.current || !manager) {
          return;
        }
        let moved = false;
        for (const drop of manager.registry.droppables.value) {
          const element = drop.element;
          if (
            element &&
            changed.some((scroller) => scroller !== element && scroller.contains(element))
          ) {
            drop.refreshShape();
            moved = true;
          }
        }
        if (moved) {
          manager.collisionObserver.forceUpdate();
          show(resolve(pointRef.current.x, pointRef.current.y));
        }
      });
    },
  };
  return { task, target, handlers };
}
