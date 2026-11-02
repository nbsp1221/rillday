import { Temporal } from 'temporal-polyfill/implementation';
import invariant from 'tiny-invariant';
import { v5 as uuidV5 } from 'uuid';
import type { DomainContext } from '../../shared-kernel/clock.ts';
import type { Workspace } from '../../workspace/workspace.ts';
import { canonical, hash } from '../../shared-kernel/canonical.ts';
import { Fault } from '../../shared-kernel/fault.ts';
import { nextDate } from '../scheduling/recurrence.ts';
import { requireTask, taskDescendants } from '../tasks/task-hierarchy.ts';
import { type Task, instantiateTask, taskProperties } from '../tasks/task.ts';
import { nextOccurrenceData } from './next-occurrence.ts';

export function completeTask(
  workspace: Workspace,
  id: string,
  completed: boolean,
  context: DomainContext,
) {
  const task = requireTask(workspace, id);
  if (Boolean(task.completedAt) === completed) {
    return;
  }
  const children = taskDescendants(workspace, id).filter((child) => !child.trashedAt);
  const existingOccurrence = Object.values(workspace.tasks).find(
    (candidate) => !candidate.purgedAt && !candidate.voided && candidate.generatedFromId === id,
  );
  if (!completed && existingOccurrence) {
    voidNextOccurrence(workspace, existingOccurrence, context);
  }

  const now = context.now();
  for (const member of [task, ...children]) {
    member.completedAt = completed ? now : null;
    member.updatedAt = now;
  }

  const { repeat, date } = task.schedule;
  if (!completed || !repeat || !date) {
    return;
  }
  const occurrenceDate = nextDate(date, repeat);
  if (occurrenceDate) {
    createNextOccurrence(workspace, task, children, occurrenceDate, date, context);
  }
}

function voidNextOccurrence(workspace: Workspace, next: Task, context: DomainContext) {
  const tree = [next, ...taskDescendants(workspace, next.id)];
  if (
    tree.some(
      (task) =>
        !task.voided &&
        (task.completedAt || task.generatedDigest !== hash(canonical(taskProperties(task)))),
    )
  ) {
    throw new Fault('next_occurrence_edited', 'conflict');
  }
  const now = context.now();
  const trashGroup = context.newId();
  for (const task of tree) {
    task.voided = true;
    if (!task.trashedAt) {
      task.trashGroup = trashGroup;
    }
    task.trashedAt = now;
    task.updatedAt = now;
  }
}

function createNextOccurrence(
  workspace: Workspace,
  root: Task,
  children: Task[],
  date: string,
  previousDate: string,
  context: DomainContext,
) {
  const tree = [root, ...children];
  const mapping = new Map(tree.map((task) => [task.id, uuidV5(task.id + ':' + date, uuidV5.URL)]));
  const dayShift = Temporal.PlainDate.from(previousDate).until(Temporal.PlainDate.from(date)).days;
  for (const source of tree) {
    const id = mapping.get(source.id);
    invariant(id !== undefined, 'Every occurrence task must have a mapped ID');
    const existing = workspace.tasks[id];
    if (existing && !existing.voided) {
      throw new Fault('next_occurrence_exists', 'conflict');
    }
    const data = nextOccurrenceData(
      { id: source.id, data: taskProperties(source) },
      root.id,
      date,
      dayShift,
      mapping,
    );
    if (existing) {
      Object.assign(existing, data, {
        trashedAt: null,
        purgedAt: null,
        trashGroup: null,
        updatedAt: context.now(),
        generatedDigest: hash(canonical(data)),
      });
    } else {
      const task = instantiateTask(id, data, context);
      task.generatedDigest = hash(canonical(data));
      workspace.tasks[id] = task;
    }
  }
}
