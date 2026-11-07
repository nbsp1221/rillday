import assert from 'node:assert/strict';
import 'fake-indexeddb/auto';
import * as Automerge from '@automerge/automerge';
import { IndexedDBStorageAdapter } from '@automerge/automerge-repo-storage-indexeddb';
import { createHabit, createWorkspace } from '@repo/domain';
import { expect, onTestFinished, test, vi } from 'vitest';
import { DurableRepo } from '../adapters/automerge/durable-repo.ts';
import {
  type WorkspaceDocument,
  emptyDocument,
  readWorkspace,
  writeWorkspace,
} from '../adapters/automerge/workspace-document.ts';
import { AutomergeWorkspaceRepository } from '../adapters/automerge/workspace-repository.ts';
import type { HabitImportChoice, HabitImportDraft } from './importing/habit-import.ts';
import { HabitImportPendingSave } from './importing/habit-import.ts';
import { WorkspaceSession } from './workspace-session.ts';
import { createHabitDraft } from './workspace/habits.ts';
import { createTaskRecord } from './workspace/tasks.ts';

const importDraft: HabitImportDraft = {
  fingerprint: 'synthetic-export',
  groups: [
    {
      key: 'reading',
      name: 'Read a book',
      kind: 'quantity',
      goal: 20,
      unit: 'min',
      records: [
        {
          date: '2024-02-29',
          value: 15,
          goal: 20,
          unit: 'min',
          skipped: false,
          note: 'Historical note',
          recordedAt: { kind: 'time', value: '21:30' },
        },
      ],
      errors: [],
      warnings: [],
    },
  ],
};
const importChoices: HabitImportChoice[] = [
  {
    key: 'reading',
    targetId: null,
    kind: 'quantity',
    frequency: 'daily',
    weeklyTarget: 3,
    confirmed: true,
    replaceDates: [],
  },
];

const context = { now: () => '2026-10-23T10:00:00.000Z', newId: () => crypto.randomUUID() };

test('habit import reviews without writes, preserves unrelated edits and saves repeated imports once', async () => {
  const { session, store } = await fixture();
  try {
    const reviewed = session.habitImports.review(importDraft, importChoices);
    expect(session.getSnapshot().data.habits).toEqual([]);
    const task = createTaskRecord('Keep this task', session.getSnapshot().data);
    assert(task);
    session.apply({ type: 'task.create', tasks: [task] });
    await session.habitImports.apply(reviewed);
    expect(session.getSnapshot().saveState).toBe('saved');
    expect(session.getSnapshot().data.tasks[0]?.title).toBe('Keep this task');
    expect(session.getSnapshot().data.habitLogs[0]).toMatchObject({
      value: 15,
      recordedAt: { kind: 'time', value: '21:30' },
    });
    expect(store.handle.fullDoc().format).toBe(2);
    const anotherTask = createTaskRecord('Undo after import', session.getSnapshot().data);
    assert(anotherTask);
    session.apply({ type: 'task.create', tasks: [anotherTask] });
    await session.flush();
    expect(session.getSnapshot().canUndo).toBe(true);
    const duplicate = session.habitImports.review(importDraft, importChoices);
    expect(duplicate.days[0]?.action).toBe('duplicate');
    await session.habitImports.apply(duplicate);
    expect(session.getSnapshot().canUndo).toBe(true);
    expect(session.getSnapshot().data.habits).toHaveLength(1);
    expect(session.getSnapshot().data.habitLogs).toHaveLength(1);
  } finally {
    await session.close();
  }
});

test('same-file reimport after deletion persists the reviewed amount without old increments', async () => {
  const { session, store } = await fixture();
  try {
    await session.habitImports.apply(session.habitImports.review(importDraft, importChoices));
    const habit = session.getSnapshot().data.habits[0];
    assert(habit);
    session.changeHabitCheckin(habit.id, '2024-02-29', { type: 'step', direction: 'increase' });
    expect(session.getSnapshot().data.habitLogs[0]?.value).toBe(16);
    session.apply({ type: 'habit.remove', id: habit.id });
    await session.flush();
    expect(session.getSnapshot().data.habitLogs).toEqual([]);
    const reviewed = session.habitImports.review(importDraft, importChoices);
    expect(reviewed.days[0]).toMatchObject({ action: 'add', incoming: { value: 15 } });
    await session.habitImports.apply(reviewed);
    expect(session.getSnapshot().data.habitLogs[0]?.value).toBe(15);
    const saved = Automerge.load<WorkspaceDocument>(Automerge.save(store.handle.fullDoc()));
    expect(Object.values(readWorkspace(saved).checkIns)[0]?.recordedAt).toEqual({
      kind: 'time',
      value: '21:30',
    });
  } finally {
    await session.close();
  }
});

test('habit import refuses stale targets and foreign workspaces and makes replacement explicit', async () => {
  const first = await fixture();
  const second = await fixture();
  try {
    const plan = first.session.habitImports.review(importDraft, importChoices);
    await expect(second.session.habitImports.apply(plan)).rejects.toThrow('workspace_transition');
    await first.session.habitImports.apply(plan);
    const changedDraft = structuredClone(importDraft);
    const record = changedDraft.groups[0]?.records[0];
    assert(record);
    record.value = 30;
    const kept = first.session.habitImports.review(changedDraft, importChoices);
    expect(kept.days[0]?.action).toBe('keep');
    await first.session.habitImports.apply(kept);
    expect(first.session.getSnapshot().data.habitLogs[0]?.value).toBe(15);
    const choice = importChoices[0];
    assert(choice);
    const replace = first.session.habitImports.review(changedDraft, [
      { ...choice, replaceDates: ['2024-02-29'] },
    ]);
    const habit = first.session.getSnapshot().data.habits[0];
    assert(habit);
    first.session.setHabitLog(habit.id, '2024-02-29', { note: 'New local edit' });
    await expect(first.session.habitImports.apply(replace)).rejects.toThrow(
      'import_review_changed',
    );
    expect(first.session.getSnapshot().data.habitLogs[0]?.note).toBe('New local edit');
  } finally {
    await Promise.all([first.session.close(), second.session.close()]);
  }
});

test('habit import reports durable failure and uses existing retry without reimporting', async () => {
  const { session, disk } = await fixture();
  const saving = vi.spyOn(disk, 'save');
  try {
    const task = createTaskRecord('Existing undo history', session.getSnapshot().data);
    assert(task);
    session.apply({ type: 'task.create', tasks: [task] });
    await session.flush();
    expect(session.getSnapshot().canUndo).toBe(true);
    const plan = session.habitImports.review(importDraft, importChoices);
    saving.mockRejectedValue(new DOMException('Full', 'QuotaExceededError'));
    const pending = session.habitImports.apply(plan);
    expect(() => session.habitImports.suggestTarget(importDraft, 'reading')).not.toThrow();
    await expect(session.habitImports.apply(plan)).rejects.toThrow('workspace_transition');
    await expect(pending).rejects.toThrow();
    expect(session.getSnapshot().saveState).toBe('error');
    expect(session.getSnapshot().canUndo).toBe(false);
    expect(session.getSnapshot().data.habitLogs).toHaveLength(1);
    saving.mockRestore();
    await session.retrySave();
    expect(session.getSnapshot().saveState).toBe('saved');
    expect(session.habitImports.review(importDraft, importChoices).days[0]?.action).toBe(
      'duplicate',
    );
  } finally {
    saving.mockRestore();
    await session.close();
  }
});

test('existing import targets use the rule effective on each historical day, not their first rule', async () => {
  const { session, store } = await fixture();
  try {
    const id = context.newId();
    const before = readWorkspace(store.handle.fullDoc());
    const next = structuredClone(before);
    const rule = {
      from: '2023-01-01',
      kind: 'quantity' as const,
      goal: 20,
      unit: 'pages',
      step: 1,
      frequency: 'daily' as const,
      weekdays: [],
      weeklyTarget: 3,
      intervalDays: 1,
    };
    createHabit(
      next,
      id,
      {
        name: 'Read',
        color: '#123456',
        icon: 'circle',
        archived: false,
        startDate: rule.from,
        zone: 'UTC',
        rank: 'a0',
        reminderTime: null,
        rules: [rule, { ...rule, from: '2024-01-01', unit: 'min' }],
      },
      context,
    );
    await store.change((document) => writeWorkspace(document, before, next));
    const choice = importChoices[0];
    assert(choice);
    const review = session.habitImports.review(importDraft, [{ ...choice, targetId: id }]);
    await session.habitImports.apply(review);
    expect(session.getSnapshot().data.habitLogs[0]).toMatchObject({
      habitId: id,
      unit: 'min',
      value: 15,
    });
    const mismatch = structuredClone(importDraft);
    const record = mismatch.groups[0]?.records[0];
    assert(record);
    record.date = '2023-02-28';
    expect(() => session.habitImports.review(mismatch, [{ ...choice, targetId: id }])).toThrow(
      'import_target_mismatch',
    );
  } finally {
    await session.close();
  }
});

test('a prior failed save cannot be mistaken for an accepted import', async () => {
  const { session, disk } = await fixture();
  const saving = vi.spyOn(disk, 'save');
  try {
    saving.mockRejectedValue(new DOMException('Full', 'QuotaExceededError'));
    const task = createTaskRecord('Unsent existing task', session.getSnapshot().data);
    assert(task);
    session.apply({ type: 'task.create', tasks: [task] });
    await expect(session.flush()).rejects.toThrow();
    const review = session.habitImports.review(importDraft, importChoices);
    await expect(session.habitImports.apply(review)).rejects.not.toBeInstanceOf(
      HabitImportPendingSave,
    );
    expect(session.getSnapshot().data.habits).toEqual([]);
    expect(session.getSnapshot().data.tasks).toHaveLength(1);
    saving.mockRestore();
    await session.retrySave();
    expect(session.getSnapshot().data.habits).toEqual([]);
  } finally {
    saving.mockRestore();
    await session.close();
  }
});

test('same-file recognition survives a new document container while accounts remain isolated', async () => {
  const first = await fixture();
  const second = await fixture();
  try {
    await first.session.habitImports.apply(
      first.session.habitImports.review(importDraft, importChoices),
    );
    const copied = readWorkspace(first.store.handle.fullDoc());
    const before = readWorkspace(second.store.handle.fullDoc());
    await second.store.change((document) => writeWorkspace(document, before, copied));
    expect(second.session.habitImports.suggestTarget(importDraft, 'reading')).toBe(
      first.session.getSnapshot().data.habits[0]?.id,
    );
    const reviewed = second.session.habitImports.review(importDraft, importChoices);
    expect(reviewed.habits).toBe(0);
    expect(reviewed.days[0]?.action).toBe('duplicate');
    const habit = second.session.getSnapshot().data.habits[0];
    assert(habit);
    second.session.setHabitLog(habit.id, '2024-02-29', { value: 30 });
    await second.session.flush();
    expect(first.session.getSnapshot().data.habitLogs[0]?.value).toBe(15);
    expect(second.session.getSnapshot().data.habitLogs[0]?.value).toBe(30);
  } finally {
    await Promise.all([first.session.close(), second.session.close()]);
  }
});

async function fixture() {
  const disk = new IndexedDBStorageAdapter('session-' + crypto.randomUUID());
  onTestFinished(() => disk.close());
  const store = await DurableRepo.create(disk, emptyDocument());
  try {
    const empty = readWorkspace(store.handle.fullDoc());
    await store.change((doc) => writeWorkspace(doc, empty, createWorkspace(context)));
    const repository = new AutomergeWorkspaceRepository(store);
    const archive = {
      exportData: vi.fn().mockResolvedValue('archive'),
      inspectImport: vi.fn().mockReturnValue({ tasks: 1, habits: 0 }),
      importData: vi.fn().mockResolvedValue(undefined),
    };
    const session = new WorkspaceSession(repository, { archive, context, zone: 'UTC' });
    return { disk, store, repository, session, archive };
  } catch (error) {
    await store.close();
    throw error;
  }
}

test('the real session captures tasks, completes a repeat and supports atomic Undo/redo through the repository port', async () => {
  const { session, store } = await fixture();
  try {
    const task = createTaskRecord('Daily review', session.getSnapshot().data, {
      date: '2026-10-23',
      repeat: { frequency: 'daily', interval: 1 },
    });
    expect.assert(task !== null);
    session.apply({ type: 'task.create', tasks: [task] });
    expect(session.getSnapshot().data.tasks[0]?.title).toBe('Daily review');
    expect(session.getSnapshot().canUndo).toBe(true);
    session.completeTask(task.id, true);
    await session.flush();
    expect(session.getSnapshot().saveState).toBe('saved');
    expect(session.getSnapshot().syncState).toBe('local');
    expect(session.getSnapshot().data.tasks).toHaveLength(2);
    session.undo();
    expect(session.getSnapshot().data.tasks).toHaveLength(1);
    expect(session.getSnapshot().data.tasks[0]?.completedAt).toBeNull();
    session.redo();
    await session.flush();
    expect(session.getSnapshot().data.tasks).toHaveLength(2);
    expect(
      Object.values(readWorkspace(store.handle.fullDoc()).tasks).some(
        (candidate) => candidate.generatedFromId === task.id,
      ),
    ).toBe(true);
  } finally {
    await session.close();
  }
});

test('a rejected atomic intent group changes neither saved data nor history', async () => {
  const { session } = await fixture();
  try {
    const task = createTaskRecord('First', session.getSnapshot().data);
    expect.assert(task !== null);
    expect(() =>
      session.apply([
        { type: 'task.create', tasks: [task] },
        { type: 'task.update', id: task.id, patch: { title: '' } },
      ]),
    ).toThrow();
    expect(session.getSnapshot().data.tasks).toEqual([]);
    expect(session.getSnapshot().canUndo).toBe(false);
    expect(session.getSnapshot().saveState).toBe('saved');
  } finally {
    await session.close();
  }
});

test('an older durable write cannot mark a newer accepted edit saved', async () => {
  const { disk, session } = await fixture();
  const started = Promise.withResolvers<void>();
  const releaseFirst = Promise.withResolvers<void>();
  const secondStarted = Promise.withResolvers<void>();
  const releaseSecond = Promise.withResolvers<void>();
  const save = disk.save.bind(disk);
  using _writes = vi
    .spyOn(disk, 'save')
    .mockImplementationOnce(async (...args) => {
      started.resolve();
      await releaseFirst.promise;
      await save(...args);
    })
    .mockImplementationOnce(async (...args) => {
      secondStarted.resolve();
      await releaseSecond.promise;
      await save(...args);
    });
  try {
    const task = createTaskRecord('First write', session.getSnapshot().data);
    expect.assert(task !== null);
    session.apply({ type: 'task.create', tasks: [task] });
    await started.promise;
    session.apply({ type: 'task.update', id: task.id, patch: { notes: 'Newer write' } });
    releaseFirst.resolve();
    await secondStarted.promise;
    expect(session.getSnapshot().data.tasks[0]?.notes).toBe('Newer write');
    expect(session.getSnapshot().saveState).toBe('saving');
    releaseSecond.resolve();
    await session.flush();
    expect(session.getSnapshot().saveState).toBe('saved');
  } finally {
    releaseFirst.resolve();
    releaseSecond.resolve();
    await session.close();
  }
});

test('a rejected group preserves existing Undo and Redo without leaking staged labels', async () => {
  const { session } = await fixture();
  try {
    const task = createTaskRecord('Original', session.getSnapshot().data);
    expect.assert(task !== null);
    session.apply({ type: 'task.create', tasks: [task] });
    session.apply({ type: 'task.update', id: task.id, patch: { notes: 'Redo entry' } });
    session.undo();
    await session.flush();
    const before = session.getSnapshot();
    expect(before.canUndo).toBe(true);
    expect(before.canRedo).toBe(true);
    expect(() =>
      session.apply([
        { type: 'task.update', id: task.id, patch: { notes: 'Rejected', tags: ['Staged'] } },
        { type: 'task.create', tasks: [{ ...task, id: context.newId(), title: '' }] },
      ]),
    ).toThrow();
    expect(session.getSnapshot()).toBe(before);
    session.redo();
    await session.flush();
    expect(session.getSnapshot().data.tasks[0]?.notes).toBe('Redo entry');
    expect(session.getSnapshot().data.labels).toEqual([]);
  } finally {
    await session.close();
  }
});

test('a task tree and its shared label publish and undo as one complete user action', async () => {
  const { session } = await fixture();
  const observations: { count: number; labels: string[]; undo: boolean; redo: boolean }[] = [];
  const unsubscribe = session.subscribe(() => {
    const snapshot = session.getSnapshot();
    observations.push({
      count: snapshot.data.tasks.length,
      labels: snapshot.data.labels ?? [],
      undo: snapshot.canUndo,
      redo: snapshot.canRedo,
    });
  });
  try {
    const parent = createTaskRecord('Parent', session.getSnapshot().data);
    expect.assert(parent !== null);
    const tasks = [
      parent,
      ...[1, 2].map((index) => {
        const createdTask = createTaskRecord(`Child ${index}`, session.getSnapshot().data, {
          parentId: parent.id,
        });
        expect.assert(createdTask !== null);
        return createdTask;
      }),
    ];
    session.apply({
      type: 'task.create',
      tasks: tasks.map((task) => ({ ...task, tags: ['Shared'] })),
    });
    expect(
      session.getSnapshot().data.tasks.filter((task) => task.parentId === parent.id),
    ).toHaveLength(2);
    expect(observations.length).toBeGreaterThan(0);
    await session.flush();
    expect(
      observations.every(
        (entry) =>
          entry.count === 3 && entry.undo && !entry.redo && entry.labels.join() === 'Shared',
      ),
    ).toBe(true);
    observations.length = 0;
    session.undo();
    expect(session.getSnapshot()).toMatchObject({
      data: { tasks: [], labels: [] },
      canUndo: false,
      canRedo: true,
    });
    expect(observations.length).toBeGreaterThan(0);
    await session.flush();
    expect(
      observations.every(
        (entry) => entry.count === 0 && !entry.undo && entry.redo && entry.labels.length === 0,
      ),
    ).toBe(true);
    observations.length = 0;
    session.redo();
    expect(session.getSnapshot()).toMatchObject({
      data: { labels: ['Shared'] },
      canUndo: true,
      canRedo: false,
    });
    expect(session.getSnapshot().data.tasks).toHaveLength(3);
    expect(observations.length).toBeGreaterThan(0);
    await session.flush();
    expect(
      observations.every(
        (entry) =>
          entry.count === 3 && entry.undo && !entry.redo && entry.labels.join() === 'Shared',
      ),
    ).toBe(true);
  } finally {
    unsubscribe();
    await session.close();
  }
});

test.each([
  { name: 'QuotaExceededError', code: 'storage_full' },
  { name: 'AbortError', code: 'save_failed' },
])(
  'a local $name retains accepted input and Undo; a later edit durably saves both changes',
  async ({ name, code }) => {
    const { session, disk, repository } = await fixture();
    const id = repository.id;
    using _writes = vi
      .spyOn(disk, 'save')
      .mockRejectedValueOnce(new DOMException('Synthetic storage failure', name));
    try {
      const task = createTaskRecord('Accepted before disk failure', session.getSnapshot().data);
      expect.assert(task !== null);
      session.apply({ type: 'task.create', tasks: [task] });
      await expect(session.flush()).rejects.toMatchObject({ name });
      expect(session.getSnapshot()).toMatchObject({
        error: code,
        syncState: 'local',
        saveState: 'error',
        canUndo: true,
      });
      expect(session.getSnapshot().data.tasks[0]?.title).toBe(task.title);
      session.apply({ type: 'task.update', id: task.id, patch: { notes: 'Next accepted edit' } });
      await session.flush();
      expect(session.getSnapshot().saveState).toBe('saved');
      session.undo();
      await session.flush();
      expect(session.getSnapshot().data.tasks[0]?.notes).toBe('');
      session.redo();
      await session.flush();
      await session.close();
      const reopened = await DurableRepo.open<WorkspaceDocument>(disk, id);
      try {
        expect(readWorkspace(reopened.handle.fullDoc()).tasks[task.id]).toMatchObject({
          title: task.title,
          notes: 'Next accepted edit',
        });
      } finally {
        await reopened.close();
      }
    } finally {
      await session.close();
    }
  },
);

test('quantity actions unskip atomically and archive operations use the injected service', async () => {
  const { session, archive } = await fixture();
  try {
    const id = context.newId();
    session.apply({
      type: 'habit.save',
      weekStartsOn: 0,
      habit: {
        id,
        name: 'Water',
        color: '#123456',
        icon: 'glass-water',
        kind: 'quantity',
        goal: 8,
        unit: 'cups',
        step: 1,
        frequency: 'daily',
        weekdays: [],
        weeklyTarget: 3,
        reminderTime: null,
        archived: false,
        createdAt: context.now(),
        startDate: '2026-10-01',
        zone: 'UTC',
      },
    });
    session.setHabitLog(id, '2026-10-23', { value: 2, skipped: true });
    session.addHabitAmount(id, '2026-10-23', 1);
    expect(session.getSnapshot().data.habitLogs[0]).toMatchObject({ value: 3, skipped: false });
    session.undo();
    expect(session.getSnapshot().data.habitLogs[0]).toMatchObject({ value: 2, skipped: true });
    expect(await session.exportData()).toBe('archive');
    expect(session.inspectImport('source')).toEqual({ tasks: 1, habits: 0 });
    await session.importData('source');
    expect(archive.exportData).toHaveBeenCalledOnce();
    expect(archive.importData).toHaveBeenCalledWith('source');
  } finally {
    await session.close();
  }
});

test('conflict presentation offers each retained alternative without native identifiers or ledgers', async () => {
  const { session, store } = await fixture();
  try {
    const task = createTaskRecord('Original', session.getSnapshot().data);
    expect.assert(task !== null);
    session.apply({ type: 'task.create', tasks: [task] });
    await session.flush();
    const remote = Automerge.load<ReturnType<typeof emptyDocument>>(
      Automerge.save(store.handle.fullDoc()),
    );
    try {
      const before = readWorkspace(remote);
      const after = structuredClone(before);

      const task1 = after.tasks[task.id];
      expect.assert(task1 !== undefined);
      task1.title = 'Remote title';
      const changed = Automerge.change(remote, (doc) => writeWorkspace(doc, before, after));
      session.apply({ type: 'task.update', id: task.id, patch: { title: 'Local title' } });
      store.handle.update((doc) => Automerge.merge(doc, changed));
      const issue = session.getSnapshot().issues[0];
      expect.assert(issue !== undefined);
      expect.assert(issue.choices[0] !== undefined);
      expect(issue.choices[0].description).toMatchObject({
        type: 'fields',
        fields: { title: { type: 'literal' } },
      });
      expect(JSON.stringify(issue.choices.map((choice) => choice.description))).not.toContain(
        task.id,
      );

      await session.resolve(issue.id, issue.choices[0].id);
      expect(session.getSnapshot().issues).toHaveLength(0);
      expect(session.getSnapshot().syncState).toBe('local');
    } finally {
      Automerge.free(remote);
    }
  } finally {
    await session.close();
  }
});

test.each(['ancestor-first', 'descendant-first'])(
  'purging an ancestor and grandchild ignores selection order: %s',
  async (order) => {
    const { session, store } = await fixture();
    try {
      const root = createTaskRecord('Root', session.getSnapshot().data, { order: 0 });
      expect.assert(root !== null);
      const parent = createTaskRecord('Parent', session.getSnapshot().data, {
        parentId: root.id,
        order: 1,
      });
      expect.assert(parent !== null);
      const child = createTaskRecord('Child', session.getSnapshot().data, {
        parentId: parent.id,
        order: 2,
      });
      expect.assert(child !== null);
      session.apply({ type: 'task.create', tasks: [root, parent, child] });
      session.trashTask(root.id);
      session.purgeTasks(order === 'ancestor-first' ? [root.id, child.id] : [child.id, root.id]);
      await session.flush();
      expect(session.getSnapshot().data.tasks).toHaveLength(0);
      expect(
        Object.values(readWorkspace(store.handle.fullDoc()).tasks).every(
          (task) => task.purgedAt === context.now(),
        ),
      ).toBe(true);
      session.undo();
      expect(session.getSnapshot().data.tasks).toHaveLength(3);
      expect(session.getSnapshot().data.tasks.every((task) => task.deleted)).toBe(true);
    } finally {
      await session.close();
    }
  },
);

test('close preserves a failed save error and still releases the owned repository and network', async () => {
  const disk = new IndexedDBStorageAdapter('session-close-' + crypto.randomUUID());
  const failure = new Error('disk_full');
  let fail = false;
  const storage = {
    load: disk.load.bind(disk),
    save: (key: string[], value: Uint8Array) =>
      fail ? Promise.reject(failure) : disk.save(key, value),
  };
  const dispose = vi.fn();
  const store = await DurableRepo.create(storage, emptyDocument(), () => ({
    adapters: [],
    dispose,
  }));
  let session: WorkspaceSession | undefined;

  try {
    const before = readWorkspace(store.handle.fullDoc());
    await store.change((doc) => writeWorkspace(doc, before, createWorkspace(context)));
    const repository = new AutomergeWorkspaceRepository(store);
    session = new WorkspaceSession(repository, {
      archive: {
        exportData: vi.fn().mockResolvedValue('archive'),
        inspectImport: vi.fn().mockReturnValue({ tasks: 0, habits: 0 }),
        importData: vi.fn().mockResolvedValue(undefined),
      },
      context,
      zone: 'UTC',
    });
    fail = true;
    const task = createTaskRecord('Unsaved', session.getSnapshot().data);
    expect.assert(task !== null);
    session.apply({ type: 'task.create', tasks: [task] });
    await expect(session.flush()).rejects.toBe(failure);
    await expect(session.close()).rejects.toBe(failure);
    expect(dispose).toHaveBeenCalledOnce();

    expect(() =>
      session?.apply({ type: 'task.update', id: task.id, patch: { title: 'After close' } }),
    ).toThrow('workspace_closed');
  } finally {
    fail = false;
    await (session?.close() ?? store.close()).catch(() => undefined);
  }
});

test('detail actions complete the retained goal and own skip, step and reset transitions', async () => {
  const habit = {
    ...createHabitDraft('pages'),
    name: 'Read',
    kind: 'quantity' as const,
    goal: 10,
    step: 3,
    startDate: '2026-10-01',
    zone: 'UTC',
  };
  const { session } = await fixture();
  onTestFinished(() => session.close());
  session.apply({ type: 'habit.save', habit, weekStartsOn: 0 });
  const day = '2026-10-23';
  session.changeHabitCheckin(habit.id, day, { type: 'amount', value: 2 });
  await session.flush();
  const savedHabit = session.getSnapshot().data.habits[0];
  expect.assert(savedHabit !== undefined);
  session.apply({
    type: 'habit.save',
    habit: { ...savedHabit, goal: 1 },
    weekStartsOn: 1,
  });
  await session.flush();
  session.changeHabitCheckin(habit.id, day, { type: 'complete' });
  await session.flush();
  expect(session.getSnapshot().data.habitLogs[0]).toMatchObject({
    goal: 10,
    value: 10,
    skipped: false,
  });
  session.changeHabitCheckin(habit.id, day, { type: 'note', text: 'Keep this note' });
  session.changeHabitCheckin(habit.id, day, { type: 'skip' });
  await session.flush();
  expect(session.getSnapshot().data.habitLogs[0]).toMatchObject({
    value: 0,
    skipped: true,
    note: 'Keep this note',
  });
  session.changeHabitCheckin(habit.id, day, { type: 'step', direction: 'increase' });
  await session.flush();
  expect(session.getSnapshot().data.habitLogs[0]).toMatchObject({
    value: 3,
    skipped: false,
    note: 'Keep this note',
  });
  session.changeHabitCheckin(habit.id, day, { type: 'step', direction: 'decrease' });
  session.changeHabitCheckin(habit.id, day, { type: 'reset' });
  await session.flush();
  expect(session.getSnapshot().data.habitLogs[0]).toMatchObject({
    value: 0,
    skipped: false,
    note: '',
  });
});

test('boolean check-in uses the habit goal and toggles back without UI patches', async () => {
  const habit = {
    ...createHabitDraft('checks'),
    name: 'Review',
    goal: 4,
    startDate: '2026-10-01',
    zone: 'UTC',
  };
  const { session } = await fixture();
  onTestFinished(() => session.close());
  session.apply({ type: 'habit.save', habit, weekStartsOn: 0 });
  expect(session.toggleHabit(habit.id, '2026-10-23')).toBe('boolean');
  await session.flush();
  expect(session.getSnapshot().data.habitLogs[0]).toMatchObject({ value: 4, skipped: false });
  session.toggleHabit(habit.id, '2026-10-23');
  await session.flush();
  expect(session.getSnapshot().data.habitLogs[0]?.value).toBe(0);
});

test('quantity check-in owns step and unskip semantics while preserving the note', async () => {
  const habit = {
    ...createHabitDraft('pages'),
    name: 'Read',
    kind: 'quantity' as const,
    goal: 8,
    step: 2.5,
    startDate: '2026-10-01',
    zone: 'UTC',
  };
  const { session } = await fixture();
  onTestFinished(() => session.close());
  session.apply({ type: 'habit.save', habit, weekStartsOn: 0 });
  session.setHabitLog(habit.id, '2026-10-23', { value: 0, skipped: true, note: 'Keep this note' });
  await session.flush();
  expect(session.toggleHabit(habit.id, '2026-10-23')).toBe('quantity');
  await session.flush();
  expect(session.getSnapshot().data.habitLogs[0]).toMatchObject({
    value: 2.5,
    skipped: false,
    note: 'Keep this note',
  });
});

test('future and unscheduled check-ins leave history and logs unchanged', async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime('2026-10-30T12:00:00.000Z');
  onTestFinished(() => {
    vi.useRealTimers();
  });
  const habit = {
    ...createHabitDraft('checks'),
    name: 'Monday review',
    frequency: 'weekdays' as const,
    weekdays: [1],
    startDate: '2026-10-01',
    zone: 'UTC',
  };
  const { session } = await fixture();
  onTestFinished(() => session.close());
  session.apply({ type: 'habit.save', habit, weekStartsOn: 0 });
  const unchanged = session.getSnapshot();
  for (const date of ['2026-10-23', '2026-10-26']) {
    expect(session.toggleHabit(habit.id, date)).toBeNull();
    session.setHabitLog(habit.id, date, { value: 1 });
    session.changeHabitCheckin(habit.id, date, { type: 'note', text: 'Unavailable' });
  }
  await session.flush();
  expect(session.getSnapshot().data.habitLogs).toEqual([]);
  expect(session.getSnapshot().data).toEqual(unchanged.data);
  expect(session.getSnapshot().canUndo).toBe(unchanged.canUndo);
});

test('weekly amounts and grouping persist offline through the real session without daily completion shortcuts', async () => {
  const { session, store } = await fixture();
  try {
    const habit = {
      ...createHabitDraft('min'),
      name: 'Practice',
      kind: 'quantity' as const,
      frequency: 'weekly-total' as const,
      goal: 60,
      step: 10,
      timeOfDay: 'evening' as const,
    };
    session.apply({ type: 'habit.save', habit, weekStartsOn: 0 });
    session.toggleHabit(habit.id, '2026-10-23');
    session.toggleHabit(habit.id, '2026-10-23');
    session.changeHabitCheckin(habit.id, '2026-10-23', { type: 'complete' });
    session.changeHabitCheckin(habit.id, '2026-10-23', { type: 'note', text: 'Actual practice' });
    await session.flush();
    const workspace = readWorkspace(store.handle.fullDoc());
    expect(workspace.habits[habit.id]).toMatchObject({
      timeOfDay: 'evening',
      rules: [{ frequency: 'weekly-total' }],
    });
    const log = session.getSnapshot().data.habitLogs[0];
    assert(log !== undefined, 'Recorded habit must persist offline');
    expect(log).toMatchObject({ value: 20, unit: 'min', note: 'Actual practice' });
    session.undo();
    session.redo();
    await session.flush();
    expect(session.getSnapshot().data.habitLogs[0]).toMatchObject(log);
    expect(session.getSnapshot().syncState).toBe('local');
  } finally {
    await session.close();
  }
});
