import { expect, test } from 'vitest';
import { createWorkspace } from '../../workspace/create-workspace.ts';
import { createTask } from './create-task.ts';
import { editTask } from './edit-task.ts';
import { purgeTask, restoreTask, trashTask } from './task-lifecycle.ts';
import { taskData } from './task.ts';

const context = { now: () => '2026-10-23T10:00:00.000Z', newId: () => crypto.randomUUID() };

function tree() {
  const workspace = createWorkspace(context);
  const listId = Object.keys(workspace.lists)[0];
  expect.assert(listId !== undefined);
  const root = createTask(workspace, context.newId(), taskData(listId, 'Parent'), context);

  const child = createTask(
    workspace,
    context.newId(),
    taskData(listId, 'Child', {
      location: { listId, parentId: root.id },
    }),
    context,
  );
  return { workspace, root, child };
}

test('task moves protect cycles and move the complete subtree to the target list', () => {
  const { workspace, root, child } = tree();
  expect(() =>
    editTask(
      workspace,
      root.id,
      {
        location: { ...root.location, parentId: child.id },
      },
      context,
    ),
  ).toThrow('cycle');
  const listId = context.newId();
  workspace.lists[listId] = {
    id: listId,
    name: 'Work',
    color: '#123456',
    system: null,
    rank: 'a1',
  };
  editTask(workspace, root.id, { location: { listId, parentId: null } }, context);
  expect([root.location.listId, child.location.listId]).toEqual([listId, listId]);
  expect(child.location.parentId).toBe(root.id);
});

test('restoring a parent keeps a child that was trashed separately in the trash', () => {
  const { workspace, root, child } = tree();
  trashTask(workspace, child.id, context);
  trashTask(workspace, root.id, context);
  restoreTask(workspace, root.id, context);
  expect(root.trashedAt).toBeNull();
  expect(child.trashedAt).toBe(context.now());
  restoreTask(workspace, child.id, context);
  expect(child.trashedAt).toBeNull();
});

test('permanent removal clears authored content while retaining the task identity tombstone', () => {
  const { workspace, root, child } = tree();
  expect(() => purgeTask(workspace, root.id, context)).toThrow('trash_required');
  trashTask(workspace, root.id, context);
  purgeTask(workspace, root.id, context);
  expect(workspace.tasks[root.id]).toMatchObject({
    title: '[purged]',
    notes: '',
    purgedAt: context.now(),
  });

  expect.assert(workspace.tasks[child.id] !== undefined);
  expect(workspace.tasks[child.id]?.purgedAt).toBe(context.now());
  expect(() => restoreTask(workspace, root.id, context)).toThrow('not_found');
});

test('moving a subtree cannot push any descendant beyond depth 100', () => {
  const { workspace, root } = tree();
  const listId = root.location.listId;
  let parentId: string | null = null;
  for (let depth = 0; depth < 100; depth++) {
    parentId = createTask(
      workspace,
      context.newId(),
      taskData(listId, `Ancestor ${depth}`, {
        location: { listId, parentId },
      }),
      context,
    ).id;
  }
  const before = structuredClone(workspace);
  expect(() => editTask(workspace, root.id, { location: { listId, parentId } }, context)).toThrow(
    'tree_too_deep',
  );
  expect(workspace).toEqual(before);
});
