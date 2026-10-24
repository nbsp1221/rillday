import { expect, test } from 'vitest';
import { createWorkspace } from '../../workspace/create-workspace.ts';
import { validateWorkspace } from '../../workspace/validate-workspace.ts';
import { createTask } from '../tasks/create-task.ts';
import { editTask } from '../tasks/edit-task.ts';
import { taskData } from '../tasks/task.ts';
import { completeTask } from './complete-task.ts';

const context = { now: () => '2026-01-31T12:00:00.000Z', newId: () => crypto.randomUUID() };

function recurringTree() {
  const workspace = createWorkspace(context);
  const listId = Object.keys(workspace.lists)[0];
  const root = createTask(
    workspace,
    context.newId(),
    taskData(listId, 'Monthly review', {
      schedule: {
        date: '2026-01-31',
        time: '09:00',
        zone: 'America/New_York',
        durationMinutes: 30,
        repeat: { frequency: 'monthly', interval: 1, until: null, anchorDay: 31 },
        reminderMinutes: null,
      },
      notes: '- [x] Review\n\n`- [x] Code`',
    }),
    context,
  );
  const child = createTask(
    workspace,
    context.newId(),
    taskData(listId, 'Review expenses', {
      location: { listId, parentId: root.id },
    }),
    context,
  );
  return { workspace, root, child };
}

test('completion generates one deterministic next tree with its month anchor and Markdown preserved', () => {
  const { workspace, root, child } = recurringTree();
  completeTask(workspace, root.id, true, context);
  const next = Object.values(workspace.tasks).find((task) => task.generatedFromId === root.id)!;
  const nextChild = Object.values(workspace.tasks).find(
    (task) => task.generatedFromId === child.id,
  )!;
  expect([root.completedAt, child.completedAt]).toEqual([context.now(), context.now()]);
  expect(next.schedule).toMatchObject({
    date: '2026-02-28',
    time: '09:00',
    zone: 'America/New_York',
    repeat: { anchorDay: 31 },
  });
  expect(next.notes).toBe('- [ ] Review\n\n`- [x] Code`');
  expect(nextChild.location.parentId).toBe(next.id);
  const ids = Object.keys(workspace.tasks);
  completeTask(workspace, root.id, true, context);
  expect(Object.keys(workspace.tasks)).toEqual(ids);
});

test('reopening and completing again reuses the pristine next occurrence and preserves its creation time', () => {
  const { workspace, root } = recurringTree();
  completeTask(workspace, root.id, true, context);
  const next = Object.values(workspace.tasks).find((task) => task.generatedFromId === root.id)!;
  completeTask(workspace, root.id, false, context);
  expect(next.voided).toBe(true);
  completeTask(workspace, root.id, true, { ...context, now: () => '2026-02-01T12:00:00.000Z' });
  expect(workspace.tasks[next.id]).toMatchObject({
    voided: false,
    trashedAt: null,
    createdAt: context.now(),
  });
  expect(
    Object.values(workspace.tasks).filter((task) => task.generatedFromId === root.id),
  ).toHaveLength(1);
});

test('an edited next child blocks reopening before the current tree is changed', () => {
  const { workspace, root, child } = recurringTree();
  completeTask(workspace, root.id, true, context);
  const nextChild = Object.values(workspace.tasks).find(
    (task) => task.generatedFromId === child.id,
  )!;
  nextChild.title = 'Keep this change';
  const before = structuredClone(workspace);
  expect(() => completeTask(workspace, root.id, false, context)).toThrow('next_occurrence_edited');
  expect(workspace).toEqual(before);
});

test('rescheduling after reopening creates an active successor beside the old voided occurrence', () => {
  const { workspace, root } = recurringTree();
  completeTask(workspace, root.id, true, context);
  const oldNext = Object.values(workspace.tasks).find((task) => task.generatedFromId === root.id)!;
  completeTask(workspace, root.id, false, context);
  editTask(workspace, root.id, { schedule: { ...root.schedule, date: '2026-03-31' } }, context);
  completeTask(workspace, root.id, true, context);
  const active = Object.values(workspace.tasks).find(
    (task) => task.generatedFromId === root.id && !task.voided,
  )!;
  expect(active.id).not.toBe(oldNext.id);
  expect(active.schedule.date).toBe('2026-04-30');
  expect(() => validateWorkspace(workspace)).not.toThrow();
  completeTask(workspace, root.id, false, context);
  expect(active.voided).toBe(true);
  expect(() => validateWorkspace(workspace)).not.toThrow();
});
