import { expect, test } from 'vitest';
import { completeTask } from '../task-management/completion/complete-task.ts';
import { createList, removeList } from '../task-management/lists/manage-lists.ts';
import { createTask } from '../task-management/tasks/create-task.ts';
import { purgeTask, restoreTask, trashTask } from '../task-management/tasks/task-lifecycle.ts';
import { taskData } from '../task-management/tasks/task.ts';
import { createWorkspace } from './create-workspace.ts';
import { includeWorkspace } from './include-workspace.ts';
import { validateWorkspace } from './validate-workspace.ts';
import { workspaceContents } from './workspace-contents.ts';

const context = { now: () => '2026-10-23T10:00:00.000Z', newId: () => crypto.randomUUID() };

test('fresh destinations inherit source settings while populated destinations retain their own settings', () => {
  const source = createWorkspace(context);
  const sourceInbox = Object.values(source.lists)[0];
  sourceInbox.name = 'Capture';
  sourceInbox.color = '#123456';
  source.matrixMode = 'complex';
  Object.values(source.quadrants)[0].name = 'Focus';
  const fresh = createWorkspace(context);
  expect(workspaceContents(fresh)).toMatchObject({ settings: false, hasData: false });
  const included = includeWorkspace(fresh, source, context);
  expect(included.matrixMode).toBe('complex');
  expect(Object.values(included.lists)[0]).toMatchObject({
    id: Object.values(fresh.lists)[0].id,
    name: 'Capture',
    color: '#123456',
  });
  expect(Object.values(included.quadrants)[0].name).toBe('Focus');
  expect(workspaceContents(included)).toMatchObject({ settings: true, hasData: true });
  createTask(fresh, context.newId(), taskData(Object.keys(fresh.lists)[0], 'Existing'), context);
  const populated = includeWorkspace(fresh, source, context);
  expect(populated.matrixMode).toBe('simple');
  expect(Object.values(populated.lists)[0].name).toBe('Inbox');
  expect(Object.values(populated.quadrants)[0].name).toBeNull();
});

test('purged records do not require their removed list or label references during inclusion', () => {
  const source = createWorkspace(context);
  const listId = context.newId();
  createList(source, listId, { name: 'Removed', color: '#123456', system: null, rank: 'a1' });
  const task = createTask(source, context.newId(), taskData(listId, 'Removed task'), context);
  trashTask(source, task.id, context);
  purgeTask(source, task.id, context);
  removeList(source, listId, context);
  expect(() => validateWorkspace(source)).not.toThrow();
  const included = includeWorkspace(createWorkspace(context), source, context);
  expect(() => validateWorkspace(included)).not.toThrow();
  expect(Object.values(included.tasks)[0]).toMatchObject({
    purgedAt: context.now(),
    location: { listId: Object.keys(included.lists)[0], parentId: null },
    labelIds: [],
  });
  expect(workspaceContents(included).hasData).toBe(false);
});

test('copied recurring trees remain pristine and separately trashed descendants keep their restore groups', () => {
  const source = createWorkspace(context);
  const inbox = Object.keys(source.lists)[0];
  const parent = createTask(
    source,
    context.newId(),
    taskData(inbox, 'Daily', {
      schedule: {
        date: '2026-10-23',
        time: null,
        zone: null,
        durationMinutes: 30,
        reminderMinutes: null,
        repeat: { frequency: 'daily', interval: 1, until: null, anchorDay: null },
      },
    }),
    context,
  );
  const child = createTask(
    source,
    context.newId(),
    taskData(inbox, 'Child', {
      location: { listId: inbox, parentId: parent.id },
    }),
    context,
  );
  completeTask(source, parent.id, true, context);
  const included = includeWorkspace(createWorkspace(context), source, context);
  const copied = Object.values(included.tasks).find(
    (task) => task.title === 'Daily' && task.completedAt,
  )!;
  expect(() => completeTask(included, copied.id, false, context)).not.toThrow();
  expect(Object.values(included.tasks).filter((task) => task.voided)).toHaveLength(2);
  trashTask(source, child.id, context);
  trashTask(source, parent.id, context);
  const trashed = includeWorkspace(createWorkspace(context), source, context);
  const copiedParent = Object.values(trashed.tasks).find(
    (task) => task.title === 'Daily' && task.completedAt,
  )!;
  restoreTask(trashed, copiedParent.id, context);
  expect(
    Object.values(trashed.tasks).find((task) => task.location.parentId === copiedParent.id)
      ?.trashedAt,
  ).toBe(context.now());
});
