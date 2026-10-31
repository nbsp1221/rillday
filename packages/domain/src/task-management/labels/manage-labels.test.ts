import { expect, test } from 'vitest';
import { createWorkspace } from '../../workspace/create-workspace.ts';
import { createList, editList, removeList } from '../lists/manage-lists.ts';
import { createTask } from '../tasks/create-task.ts';
import { taskData } from '../tasks/task.ts';
import { createLabel, editLabel, removeLabel } from './manage-labels.ts';

const context = { now: () => '2026-10-23T10:00:00.000Z', newId: () => crypto.randomUUID() };

test('label edits preserve order, reject duplicate normalized names and remove task references', () => {
  const workspace = createWorkspace(context);
  const id = context.newId();
  const otherId = context.newId();
  createLabel(workspace, id, { name: 'Review', color: null, rank: 'b0' });
  createLabel(workspace, otherId, { name: 'Work', color: null });
  editLabel(workspace, id, { name: 'Read' });
  expect(workspace.labels[id]).toMatchObject({ name: 'Read', rank: 'b0' });
  expect(() => editLabel(workspace, id, { name: 'Work' })).toThrow('constraint_violation');
  const entry = Object.keys(workspace.lists)[0];
  expect.assert(entry !== undefined);
  const task = createTask(
    workspace,
    context.newId(),
    taskData(entry, 'Read', { labelIds: [id] }),
    context,
  );
  removeLabel(workspace, id, context);
  expect(task.labelIds).toEqual([]);
  expect(workspace.labels[id]).toBeUndefined();
});

test('list removal protects Inbox and preserves the task hierarchy while moving it to Inbox', () => {
  const workspace = createWorkspace(context);
  const inboxId = Object.keys(workspace.lists)[0];
  const listId = context.newId();
  createList(workspace, listId, { name: 'Work', color: '#123456', rank: 'b0' });
  editList(workspace, listId, { name: 'Projects' });
  expect.assert(workspace.lists[listId] !== undefined);
  expect(workspace.lists[listId].rank).toBe('b0');
  const root = createTask(workspace, context.newId(), taskData(listId, 'Parent'), context);
  const child = createTask(
    workspace,
    context.newId(),
    taskData(listId, 'Child', { location: { listId, parentId: root.id } }),
    context,
  );
  expect.assert(inboxId !== undefined);
  expect(() => removeList(workspace, inboxId, context)).toThrow('inbox_protected');
  removeList(workspace, listId, context);
  expect([root.location.listId, child.location.listId]).toEqual([inboxId, inboxId]);
  expect(child.location.parentId).toBe(root.id);
  expect(workspace.lists[listId]).toBeUndefined();
});
