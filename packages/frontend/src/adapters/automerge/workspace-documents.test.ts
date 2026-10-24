import 'fake-indexeddb/auto';
import * as Automerge from '@automerge/automerge';
import { IndexedDBStorageAdapter } from '@automerge/automerge-repo-storage-indexeddb';
import {
  createHabit,
  createTask,
  createWorkspace,
  editTask,
  incrementCheckIn,
  quantityValue,
  taskData,
} from '@repo/domain';
import { produce } from 'immer';
import { expect, onTestFinished, test, vi } from 'vitest';
import { decodeWorkspaceArchive, encodeWorkspaceArchive } from './workspace-archive.ts';
import { type WorkspaceDocument, writeWorkspace } from './workspace-document.ts';
import { AutomergeWorkspaceDocuments } from './workspace-documents.ts';

const context = { now: () => '2026-10-23T10:00:00.000Z', newId: () => crypto.randomUUID() };

test('native workspace creation, offline reopen and archive restoration preserve data with a new document identity', async () => {
  const disk = new IndexedDBStorageAdapter('documents-' + crypto.randomUUID());
  onTestFinished(() => disk.close());
  const documents = new AutomergeWorkspaceDocuments(disk, () => ({
    owned: { adapters: [], dispose() {} },
  }));
  const workspace = createWorkspace(context);
  const task = createTask(
    workspace,
    context.newId(),
    taskData(Object.keys(workspace.lists)[0], 'Original'),
    context,
  );
  const first = await documents.create(workspace);
  onTestFinished(() => first.repository.close());
  const originalId = first.repository.id;
  await first.repository.commit(
    produce(workspace, (draft) => editTask(draft, task.id, { title: 'Edited' }, context)),
  );
  const source = await first.exportData();
  await first.repository.close();
  const reopened = await documents.open(originalId);
  onTestFinished(() => reopened.repository.close());
  expect(reopened.repository.getSnapshot().workspace.tasks[task.id].title).toBe('Edited');
  const restored = await documents.restoreArchive(source);
  onTestFinished(() => restored.repository.close());
  expect(restored.repository.id).not.toBe(originalId);
  expect(restored.repository.getSnapshot().workspace).toEqual(
    reopened.repository.getSnapshot().workspace,
  );
  expect(documents.inspectArchive(await restored.exportData())).toEqual(
    restored.repository.getSnapshot().workspace,
  );
  expect(documents.inspectArchive(source).tasks[task.id].title).toBe('Edited');
});

test('invalid archives never open networking or replace an existing document', async () => {
  const disk = new IndexedDBStorageAdapter('invalid-archive-' + crypto.randomUUID());
  onTestFinished(() => disk.close());
  const network = vi.fn(() => ({ owned: { adapters: [], dispose() {} } }));
  const documents = new AutomergeWorkspaceDocuments(disk, network);
  for (const source of [
    '{}',
    'not JSON',
    JSON.stringify({ format: 'rillday-workspace', version: 1, document: 'aGVsbG8=' }),
  ]) {
    await expect(documents.restoreArchive(source)).rejects.toThrow('invalid_backup');
  }
  expect(network).not.toHaveBeenCalled();
  expect(await disk.loadRange([])).toEqual([]);
});

test(
  'including a large local collection preserves the destination and is idempotent after reopening',
  { timeout: 30_000 },
  async () => {
    const disk = new IndexedDBStorageAdapter('large-inclusion-' + crypto.randomUUID());
    onTestFinished(() => disk.close());
    const documents = new AutomergeWorkspaceDocuments(disk, () => ({
      owned: { adapters: [], dispose() {} },
    }));
    const sourceWorkspace = createWorkspace(context);
    const sourceInbox = Object.keys(sourceWorkspace.lists)[0];
    for (let index = 0; index < 2201; index++) {
      createTask(
        sourceWorkspace,
        context.newId(),
        taskData(sourceInbox, `Local task ${index}`),
        context,
      );
    }
    const source = await documents.create(sourceWorkspace);
    onTestFinished(() => source.repository.close());
    const targetWorkspace = createWorkspace(context);
    const existing = createTask(
      targetWorkspace,
      context.newId(),
      taskData(Object.keys(targetWorkspace.lists)[0], 'Existing account task'),
      context,
    );
    const target = await documents.create(targetWorkspace);
    onTestFinished(() => target.repository.close());
    const id = target.repository.id;
    const archive = await source.exportData();
    await target.includeArchive(archive);
    const included = target.repository.getSnapshot().workspace;
    expect(Object.keys(included.tasks)).toHaveLength(2202);
    expect(included.tasks[existing.id]).toEqual(existing);
    expect(
      Object.values(included.tasks).every((task) => Boolean(included.lists[task.location.listId])),
    ).toBe(true);
    await target.repository.close();
    const reopened = await documents.open(id);
    onTestFinished(() => reopened.repository.close());
    await reopened.includeArchive(archive);
    expect(reopened.repository.getSnapshot().workspace).toEqual(included);
  },
);

test('including an independent archive copies quantities once without moving existing adjustment entries', async () => {
  const disk = new IndexedDBStorageAdapter('inclusion-' + crypto.randomUUID());
  onTestFinished(() => disk.close());
  const documents = new AutomergeWorkspaceDocuments(disk, () => ({
    owned: { adapters: [], dispose() {} },
  }));
  const workspace = createWorkspace(context);
  const habitId = context.newId();
  createHabit(
    workspace,
    habitId,
    {
      name: 'Water',
      color: '#7d9cc4',
      icon: 'circle',
      archived: false,
      startDate: '2026-10-01',
      reminderTime: null,
      zone: 'UTC',
      rank: 'a0',
      rules: [
        {
          from: '2026-10-01',
          kind: 'quantity',
          goal: 8,
          unit: 'cups',
          step: 1,
          frequency: 'daily',
          weekdays: [],
          weeklyTarget: 4,
          intervalDays: 1,
        },
      ],
    },
    context,
  );
  incrementCheckIn(workspace, habitId, '2026-10-23', 2, context);
  const source = await documents.create(workspace);
  onTestFinished(() => source.repository.close());
  const target = await documents.create(workspace);
  onTestFinished(() => target.repository.close());
  const archive = await source.exportData();
  await target.includeArchive(archive);
  const included = target.repository.getSnapshot().workspace;
  expect(Object.keys(included.habits)).toHaveLength(2);
  expect(Object.values(included.checkIns).map((log) => quantityValue(log.quantity))).toEqual([
    2, 2,
  ]);
  const id = target.repository.id;
  await target.repository.close();
  const reopened = await documents.open(id);
  onTestFinished(() => reopened.repository.close());
  await reopened.includeArchive(archive);
  expect(Object.keys(reopened.repository.getSnapshot().workspace.habits)).toHaveLength(2);
  expect(
    Object.values(reopened.repository.getSnapshot().workspace.checkIns).map((log) =>
      quantityValue(log.quantity),
    ),
  ).toEqual([2, 2]);
});

test('a retained local copy rejoins shared native history instead of duplicating product records', async () => {
  const disk = new IndexedDBStorageAdapter('rejoin-' + crypto.randomUUID());
  onTestFinished(() => disk.close());
  const documents = new AutomergeWorkspaceDocuments(disk, () => ({
    owned: { adapters: [], dispose() {} },
  }));
  const workspace = createWorkspace(context);
  const task = createTask(
    workspace,
    context.newId(),
    taskData(Object.keys(workspace.lists)[0], 'Read'),
    context,
  );
  const server = await documents.create(workspace);
  onTestFinished(() => server.repository.close());
  const local = await documents.restoreArchive(await server.exportData());
  onTestFinished(() => local.repository.close());
  await server.repository.commit(
    produce(workspace, (draft) => editTask(draft, task.id, { priority: 3 }, context)),
  );
  await local.repository.commit(
    produce(workspace, (draft) => editTask(draft, task.id, { title: 'Read locally' }, context)),
  );
  const archive = await local.exportData();
  await server.includeArchive(archive);
  await server.includeArchive(archive);
  const merged = server.repository.getSnapshot();
  expect(Object.keys(merged.workspace.tasks)).toHaveLength(1);
  expect(merged.workspace.tasks[task.id]).toMatchObject({ title: 'Read locally', priority: 3 });
  expect(merged.decisions).toEqual([]);
});

test('an immutable archive with a late same-field conflict is rejected without copying its displayed winner', async () => {
  const disk = new IndexedDBStorageAdapter('conflicted-archive-' + crypto.randomUUID());
  onTestFinished(() => disk.close());
  const documents = new AutomergeWorkspaceDocuments(disk, () => ({
    owned: { adapters: [], dispose() {} },
  }));
  const workspace = createWorkspace(context);
  const task = createTask(
    workspace,
    context.newId(),
    taskData(Object.keys(workspace.lists)[0], 'Original'),
    context,
  );
  const original = await documents.create(workspace);
  onTestFinished(() => original.repository.close());
  const binary = decodeWorkspaceArchive(await original.exportData()).binary;
  const first = Automerge.load<WorkspaceDocument>(binary);
  const second = Automerge.load<WorkspaceDocument>(binary);
  onTestFinished(() => {
    Automerge.free(first);
    Automerge.free(second);
  });
  const local = Automerge.change(first, (draft) =>
    writeWorkspace(
      draft,
      workspace,
      produce(workspace, (state) => editTask(state, task.id, { title: 'First edit' }, context)),
    ),
  );
  const remote = Automerge.change(second, (draft) =>
    writeWorkspace(
      draft,
      workspace,
      produce(workspace, (state) => editTask(state, task.id, { title: 'Second edit' }, context)),
    ),
  );
  const conflicted = encodeWorkspaceArchive(Automerge.merge(local, remote));
  const target = await documents.create(createWorkspace(context));
  onTestFinished(() => target.repository.close());
  const before = target.repository.getSnapshot().workspace;
  await expect(target.includeArchive(conflicted)).rejects.toThrow('edit_conflict');
  await expect(target.replaceArchive(conflicted)).rejects.toThrow('edit_conflict');
  expect(target.repository.getSnapshot().workspace).toEqual(before);
});

test('archive replacement stays in the existing document lineage and is visible after offline reopen', async () => {
  const disk = new IndexedDBStorageAdapter('replace-archive-' + crypto.randomUUID());
  onTestFinished(() => disk.close());
  const documents = new AutomergeWorkspaceDocuments(disk, () => ({
    owned: { adapters: [], dispose() {} },
  }));
  const workspace = createWorkspace(context);
  const task = createTask(
    workspace,
    context.newId(),
    taskData(Object.keys(workspace.lists)[0], 'Original'),
    context,
  );
  const target = await documents.create(workspace);
  onTestFinished(() => target.repository.close());
  const archive = await target.exportData();
  await target.repository.commit(
    produce(workspace, (draft) => editTask(draft, task.id, { title: 'Later edit' }, context)),
  );
  const id = target.repository.id;
  await target.replaceArchive(archive);
  expect(target.repository.id).toBe(id);
  expect(target.repository.getSnapshot().workspace.tasks[task.id].title).toBe('Original');
  await target.repository.close();
  const reopened = await documents.open(id);
  onTestFinished(() => reopened.repository.close());
  expect(reopened.repository.getSnapshot().workspace.tasks[task.id].title).toBe('Original');
});

test('restoring a pre-inclusion archive also restores inclusion bookkeeping so a later inclusion is not skipped', async () => {
  const disk = new IndexedDBStorageAdapter('restore-inclusion-' + crypto.randomUUID());
  onTestFinished(() => disk.close());
  const documents = new AutomergeWorkspaceDocuments(disk, () => ({
    owned: { adapters: [], dispose() {} },
  }));
  const source = createWorkspace(context);
  createTask(
    source,
    context.newId(),
    taskData(Object.keys(source.lists)[0], 'Include again'),
    context,
  );
  const incoming = await documents.create(source);
  onTestFinished(() => incoming.repository.close());
  const target = await documents.create(createWorkspace(context));
  onTestFinished(() => target.repository.close());
  const empty = await target.exportData();
  const archive = await incoming.exportData();
  await target.includeArchive(archive);
  expect(Object.keys(target.repository.getSnapshot().workspace.tasks)).toHaveLength(1);
  await target.replaceArchive(empty);
  expect(Object.keys(target.repository.getSnapshot().workspace.tasks)).toHaveLength(0);
  await target.includeArchive(archive);
  expect(
    Object.values(target.repository.getSnapshot().workspace.tasks).map((task) => task.title),
  ).toEqual(['Include again']);
});
