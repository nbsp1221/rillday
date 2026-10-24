import { z } from 'zod';
import { habitLogSchema } from '../habit-tracking/check-ins/check-in.ts';
import { checkInId } from '../habit-tracking/check-ins/record-check-in.ts';
import {
  quantityProblems,
  recordedQuantitySchema,
} from '../habit-tracking/check-ins/recorded-quantity.ts';
import { habitSchema } from '../habit-tracking/habits/habit.ts';
import { quadrantSchema } from '../matrix/quadrant.ts';
import { canonical, hash } from '../shared-kernel/canonical.ts';
import { Fault } from '../shared-kernel/fault.ts';
import { uuid } from '../shared-kernel/values.ts';
import { labelSchema } from '../task-management/labels/label.ts';
import { taskListSchema } from '../task-management/lists/task-list.ts';
import { taskProperties, taskSchema } from '../task-management/tasks/task.ts';
import type { Workspace } from './workspace.ts';

const timestamp = z.iso.datetime();
const task = taskSchema.extend({
  id: uuid,
  createdAt: timestamp,
  updatedAt: timestamp,
  trashedAt: timestamp.nullable(),
  purgedAt: timestamp.nullable(),
  generatedDigest: z.string().nullable(),
  trashGroup: uuid.nullable(),
});

const workspaceSchema = z.strictObject({
  tasks: z.record(uuid, task),
  lists: z.record(uuid, taskListSchema.extend({ id: uuid })),
  labels: z.record(uuid, labelSchema.extend({ id: uuid })),
  habits: z.record(uuid, habitSchema.safeExtend({ id: uuid, createdAt: timestamp })),
  checkIns: z.record(
    uuid,
    habitLogSchema.omit({ value: true }).extend({ id: uuid, quantity: recordedQuantitySchema }),
  ),
  quadrants: z.record(uuid, quadrantSchema.extend({ id: uuid })),
  matrixMode: z.enum(['simple', 'complex']),
});

export type WorkspaceCollection = Exclude<keyof Workspace, 'matrixMode'>;

export type WorkspaceTarget =
  | { collection: WorkspaceCollection; id: string }
  | { collection: 'workspace'; id: 'matrixMode' };

export interface WorkspaceProblem {
  code: string;
  targets: WorkspaceTarget[];
}

export function parseWorkspace(input: unknown): Workspace {
  const parsed = workspaceSchema.safeParse(input);
  if (!parsed.success) {
    throw new Fault('invalid_workspace');
  }
  return parsed.data;
}

export function inspectWorkspace(workspace: Workspace): WorkspaceProblem[] {
  const problems: WorkspaceProblem[] = [];

  const report = (code: string, targets: WorkspaceTarget[]) => problems.push({ code, targets });
  const taskTarget = (id: string): WorkspaceTarget => ({ collection: 'tasks', id });

  for (const collection of [
    'tasks',
    'lists',
    'labels',
    'habits',
    'checkIns',
    'quadrants',
  ] as const) {
    const records: Readonly<Record<string, { id: string }>> = workspace[collection];
    for (const [id, record] of Object.entries(records)) {
      if (id !== record.id) {
        report('invalid_identity', [{ collection, id }]);
      }
    }
  }
  const inboxes = Object.values(workspace.lists).filter((list) => list.system === 'inbox');
  if (inboxes.length !== 1) {
    report(
      'missing_inbox',
      inboxes.map((list) => ({ collection: 'lists', id: list.id })),
    );
  }
  const names = new Map<string, string>();
  for (const label of Object.values(workspace.labels)) {
    const name = label.name.normalize('NFC');
    const previous = names.get(name);
    if (previous) {
      report('constraint_violation', [
        { collection: 'labels', id: previous },
        { collection: 'labels', id: label.id },
      ]);
    }
    names.set(name, label.id);
  }

  const quadrants = Object.values(workspace.quadrants);
  if (quadrants.length !== 4 || new Set(quadrants.map((quadrant) => quadrant.key)).size !== 4) {
    report(
      'invalid_quadrants',
      quadrants.map(({ id }) => ({ collection: 'quadrants', id })),
    );
  }

  const cycles = new Set<string>();
  const occurrences = new Map<string, string>();
  for (const task of Object.values(workspace.tasks)) {
    if (task.generatedFromId && !task.purgedAt && !task.voided) {
      const previous = occurrences.get(task.generatedFromId);
      if (previous) {
        report('next_occurrence_exists', [taskTarget(previous), taskTarget(task.id)]);
      }
      occurrences.set(task.generatedFromId, task.id);
    }
    if (task.purgedAt) {
      continue;
    }
    if (!workspace.lists[task.location.listId]) {
      report('not_found', [taskTarget(task.id), { collection: 'lists', id: task.location.listId }]);
    }
    for (const id of task.labelIds) {
      if (!workspace.labels[id]) {
        report('not_found', [taskTarget(task.id), { collection: 'labels', id }]);
      }
    }
    if (
      task.voided &&
      task.generatedDigest &&
      task.generatedDigest !== hash(canonical({ ...taskProperties(task), voided: false }))
    ) {
      report('next_occurrence_edited', [taskTarget(task.id)]);
    }
    const path = [task.id];
    let parentId = task.location.parentId;
    while (parentId) {
      const index = path.indexOf(parentId);
      if (index >= 0) {
        const members = path.slice(index).sort();
        const key = members.join(':');
        if (!cycles.has(key)) {
          report('cycle', members.map(taskTarget));
        }
        cycles.add(key);
        break;
      }
      if (path.length > 100) {
        report('tree_too_deep', path.map(taskTarget));
        break;
      }
      const parent = workspace.tasks[parentId];
      if (!parent || parent.purgedAt) {
        report('not_found', [taskTarget(task.id), taskTarget(parentId)]);
        break;
      }
      if (parent.location.listId !== task.location.listId) {
        report('parent_list_mismatch', [taskTarget(task.id), taskTarget(parentId)]);
      }
      if (!task.trashedAt && parent.trashedAt) {
        report('trashed', [taskTarget(task.id), taskTarget(parentId)]);
      }
      path.push(parentId);
      parentId = parent.location.parentId;
    }
  }
  for (const checkIn of Object.values(workspace.checkIns)) {
    if (checkIn.id !== checkInId(checkIn.habitId, checkIn.date)) {
      report('invalid_log_target', [{ collection: 'checkIns', id: checkIn.id }]);
    }
    for (const code of quantityProblems(checkIn.quantity)) {
      report(code, [{ collection: 'checkIns', id: checkIn.id }]);
    }
    if (!workspace.habits[checkIn.habitId]) {
      report('not_found', [
        { collection: 'checkIns', id: checkIn.id },
        { collection: 'habits', id: checkIn.habitId },
      ]);
    }
  }
  return problems;
}

export function validateWorkspace(workspace: Workspace) {
  parseWorkspace(workspace);
  const problem = inspectWorkspace(workspace)[0];
  if (problem) {
    throw new Fault(problem.code, 'conflict');
  }
}
