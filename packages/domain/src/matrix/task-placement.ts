import { Temporal } from 'temporal-polyfill/implementation';
import type { Priority } from '../task-management/tasks/task.ts';
import type { QuadrantData } from './quadrant.ts';

type MatrixTask = { priority: Priority; date: string | null };
type MatrixQuadrant = Pick<QuadrantData, 'key' | 'important' | 'urgent'>;

export const quadrantPriorities: Readonly<Record<QuadrantData['key'], Priority>> = {
  do: 3,
  plan: 2,
  delegate: 1,
  later: 0,
};

const addDays = (date: string, days: number) =>
  Temporal.PlainDate.from(date).add({ days }).toString();

export function classifyMatrixTask(task: MatrixTask, today: string) {
  return {
    important: task.priority >= 2,
    urgent: task.date !== null && task.date <= addDays(today, 1),
  };
}

export function belongsToQuadrant(
  task: MatrixTask,
  quadrant: MatrixQuadrant,
  mode: 'simple' | 'complex',
  today: string,
): boolean {
  if (mode === 'simple') {
    return task.priority === quadrantPriorities[quadrant.key];
  }
  const { important, urgent } = classifyMatrixTask(task, today);
  return important === quadrant.important && urgent === quadrant.urgent;
}

export function placeTaskInQuadrant(
  task: MatrixTask,
  quadrant: MatrixQuadrant,
  mode: 'simple' | 'complex',
  today: string,
): { priority: Priority; date?: string | null } {
  if (mode === 'simple') {
    return { priority: quadrantPriorities[quadrant.key] };
  }
  const { urgent } = classifyMatrixTask(task, today);
  return {
    priority: quadrant.important
      ? task.priority < 2
        ? 2
        : task.priority
      : task.priority > 1
        ? 1
        : task.priority,
    date: quadrant.urgent ? (urgent ? task.date : today) : urgent ? addDays(today, 2) : task.date,
  };
}
