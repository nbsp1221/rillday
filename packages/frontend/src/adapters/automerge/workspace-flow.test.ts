import 'fake-indexeddb/auto';
import { IndexedDBStorageAdapter } from '@automerge/automerge-repo-storage-indexeddb';
import {
  type Workspace,
  completeTask,
  createTask,
  createWorkspace,
  taskData,
  validateWorkspace,
  workspaceCollectionSchema,
} from '@repo/domain';
import { expect, test } from 'vitest';
import { WorkspaceHistory } from '../../application/workspace-history.ts';
import { applyWorkspaceIntent } from '../../application/workspace/apply-intent.ts';
import { presentWorkspace } from '../../application/workspace/present-workspace.ts';
import { createTaskRecord } from '../../application/workspace/tasks.ts';
import { DurableRepo } from './durable-repo.ts';
import {
  type WorkspaceDocument,
  emptyDocument,
  readWorkspace,
  recordVersion,
  writeWorkspace,
} from './workspace-document.ts';

const context = { now: () => '2026-10-23T10:00:00.000Z', newId: () => crypto.randomUUID() };

test('capture, repeat completion, offline reload and Undo use typed domain data with one atomic durable document', async () => {
  const disk = new IndexedDBStorageAdapter('workspace-flow-' + crypto.randomUUID());
  const store = await DurableRepo.create(disk, emptyDocument());
  try {
    const empty = readWorkspace(store.handle.fullDoc());
    await store.change((doc) => writeWorkspace(doc, empty, createWorkspace(context)));
    let writing = Promise.resolve();
    const history = new WorkspaceHistory(
      ([collection, id]) =>
        recordVersion(store.handle.fullDoc(), {
          collection: workspaceCollectionSchema.parse(collection),
          id: String(id),
        }),
      validateWorkspace,
    );

    const edit = async (recipe: (draft: Workspace) => void) => {
      const before = readWorkspace(store.handle.fullDoc());
      history.change(
        before,
        (draft) => {
          recipe(draft);
          validateWorkspace(draft);
        },
        (after) => {
          writing = store.change((doc) => writeWorkspace(doc, before, after));
        },
      );
      await writing;
    };

    const view = presentWorkspace(readWorkspace(store.handle.fullDoc()), 'UTC');
    const task = createTaskRecord('Daily review', view, {
      date: '2026-10-23',
      repeat: { frequency: 'daily', interval: 1 },
    });
    expect.assert(task !== null);
    await edit((draft) =>
      applyWorkspaceIntent(draft, { type: 'task.create', tasks: [task] }, context, 'UTC'),
    );
    await edit((draft) => completeTask(draft, task.id, true, context));
    expect(store.saved).toBe(true);
    const reopened = await DurableRepo.open<WorkspaceDocument>(disk, store.handle.documentId);
    try {
      const persisted = readWorkspace(reopened.handle.fullDoc());
      const next = Object.values(persisted.tasks).find(
        (candidate) => candidate.generatedFromId === task.id,
      );

      expect.assert(persisted.tasks[task.id] !== undefined);
      expect(persisted.tasks[task.id]?.completedAt).toBe(context.now());
      expect(next?.schedule.date).toBe('2026-10-24');
    } finally {
      await reopened.close();
    }
    const beforeUndo = readWorkspace(store.handle.fullDoc());
    history.undo(beforeUndo, (after) => {
      writing = store.change((doc) => writeWorkspace(doc, beforeUndo, after));
    });
    await writing;
    const restored = readWorkspace(store.handle.fullDoc());

    expect.assert(restored.tasks[task.id] !== undefined);
    expect(restored.tasks[task.id]?.completedAt).toBeNull();
    expect(Object.keys(restored.tasks)).toEqual([task.id]);
    expect(() => validateWorkspace(restored)).not.toThrow();
  } finally {
    await store.close();
  }
});

test('Undo cannot remove a parent referenced by a later remote child', async () => {
  const disk = new IndexedDBStorageAdapter('workspace-undo-' + crypto.randomUUID());
  const store = await DurableRepo.create(disk, emptyDocument());
  try {
    const empty = readWorkspace(store.handle.fullDoc());
    await store.change((doc) => writeWorkspace(doc, empty, createWorkspace(context)));
    let writing = Promise.resolve();
    const history = new WorkspaceHistory(
      ([collection, id]) =>
        recordVersion(store.handle.fullDoc(), {
          collection: workspaceCollectionSchema.parse(collection),
          id: String(id),
        }),
      validateWorkspace,
    );
    const before = readWorkspace(store.handle.fullDoc());
    const listId = Object.keys(before.lists)[0];
    const parentId = context.newId();
    history.change(
      before,
      (draft) => {
        expect.assert(listId !== undefined);
        createTask(draft, parentId, taskData(listId, 'Parent'), context);
      },
      (after) => {
        writing = store.change((doc) => writeWorkspace(doc, before, after));
      },
    );
    await writing;
    const remote = structuredClone(readWorkspace(store.handle.fullDoc()));
    const childId = context.newId();
    expect.assert(listId !== undefined);
    createTask(
      remote,
      childId,
      taskData(listId, 'Remote child', { location: { listId, parentId } }),
      context,
    );
    const beforeRemote = readWorkspace(store.handle.fullDoc());
    await store.change((doc) => writeWorkspace(doc, beforeRemote, remote));
    const current = readWorkspace(store.handle.fullDoc());
    expect(() =>
      history.undo(current, (after) => {
        writing = store.change((doc) => writeWorkspace(doc, current, after));
      }),
    ).toThrow();
    expect(history.canUndo).toBe(true);
    expect(history.canRedo).toBe(false);
    expect(readWorkspace(store.handle.fullDoc()).tasks[childId]?.location.parentId).toBe(parentId);
    expect(readWorkspace(store.handle.fullDoc()).tasks[parentId]).toBeDefined();
  } finally {
    await store.close();
  }
});
