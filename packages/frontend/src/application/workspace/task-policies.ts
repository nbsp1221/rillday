import { belongsToQuadrant, placeTaskInQuadrant } from '@repo/domain';
import { Temporal } from 'temporal-polyfill/implementation';
import type { Quadrant, Task, WorkspaceData } from './model.ts';
import { dateKey } from './dates.ts';

export { quadrantPriorities } from '@repo/domain';

export type TaskPatch = Partial<
  Pick<
    Task,
    | 'title'
    | 'notes'
    | 'tags'
    | 'priority'
    | 'date'
    | 'time'
    | 'duration'
    | 'repeat'
    | 'reminderMinutes'
    | 'listId'
    | 'parentId'
    | 'pinned'
  >
>;

export interface TaskScheduleTarget {
  date: string | null;
  time?: string | null;
}

export function normalizeTaskPatch(task: Task, patch: TaskPatch): TaskPatch {
  const next = { ...patch };

  if (next.date === null) {
    next.time = null;
    next.repeat = null;
  }

  const repeat = next.repeat === undefined ? task.repeat : next.repeat;

  if (next.date && repeat?.frequency === 'monthly') {
    next.repeat = { ...repeat, anchorDay: Temporal.PlainDate.from(next.date).day };
  }

  return next;
}

export function calendarTaskPatch(task: Task, target: TaskScheduleTarget): TaskPatch {
  return {
    date: target.date,
    time: target.date === null ? null : target.time === undefined ? task.time : target.time,
  };
}

export function taskBelongsToQuadrant(
  task: Task,
  quadrant: Quadrant,
  mode: 'simple' | 'complex',
  today = dateKey(),
): boolean {
  return belongsToQuadrant(task, { ...quadrant, key: quadrant.id }, mode, today);
}

export function matrixTaskPatch(
  task: Task,
  quadrant: Quadrant,
  mode: 'simple' | 'complex',
  today = dateKey(),
): TaskPatch {
  return placeTaskInQuadrant(task, { ...quadrant, key: quadrant.id }, mode, today);
}

export function reorderTask(
  data: WorkspaceData,
  from: string,
  to: string,
  placement: 'before' | 'after',
): boolean {
  const ordered = data.tasks
    .filter((task) => !task.deleted && !task.completedAt)
    .sort((a, b) => a.order - b.order);
  const source = ordered.findIndex((task) => task.id === from);
  const target = ordered.findIndex((task) => task.id === to);

  if (
    from === to ||
    source < 0 ||
    target < 0 ||
    ordered[source].pinned !== ordered[target].pinned
  ) {
    return false;
  }

  const before = ordered.map((task) => task.id).join();
  const [moved] = ordered.splice(source, 1);
  const at = ordered.findIndex((task) => task.id === to) + (placement === 'after' ? 1 : 0);
  ordered.splice(at, 0, moved);

  if (before === ordered.map((task) => task.id).join()) {
    return false;
  }

  const previous = ordered[at - 1]?.order;
  const next = ordered[at + 1]?.order;
  const order =
    previous === undefined
      ? (next ?? 0) - 1
      : next === undefined
        ? previous + 1
        : (previous + next) / 2;

  if (
    Number.isFinite(order) &&
    (previous === undefined || order > previous) &&
    (next === undefined || order < next)
  ) {
    moved.order = order;
  } else {
    // Exhausted floating-point gaps must not scramble hidden tasks between visible rows.
    ordered.forEach((task, index) => {
      task.order = index;
    });
  }

  return true;
}
