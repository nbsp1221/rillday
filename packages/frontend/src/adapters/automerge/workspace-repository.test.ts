import 'fake-indexeddb/auto';
import * as Automerge from '@automerge/automerge';
import { IndexedDBStorageAdapter } from '@automerge/automerge-repo-storage-indexeddb';
import {
  createHabit,
  createTask,
  createWorkspace,
  editTask,
  incrementCheckIn,
  inspectWorkspace,
  quantityValue,
  recordCheckIn,
  removeHabit,
  taskData,
  validateWorkspace,
  weeklyHabitAmount,
} from '@repo/domain';
import { produce } from 'immer';
import { expect, test } from 'vitest';
import { DurableRepo } from './durable-repo.ts';
import {
  type WorkspaceDocument,
  emptyDocument,
  readWorkspace,
  writeWorkspace,
} from './workspace-document.ts';
import { AutomergeWorkspaceRepository } from './workspace-repository.ts';

const context = { now: () => '2026-10-23T10:00:00.000Z', newId: () => crypto.randomUUID() };

async function fixture() {
  const disk = new IndexedDBStorageAdapter('workspace-port-' + crypto.randomUUID());
  const store = await DurableRepo.create(disk, emptyDocument());
  try {
    const workspace = createWorkspace(context);
    const listId = Object.keys(workspace.lists)[0];
    const first = createTask(workspace, context.newId(), taskData(listId, 'First'), context);
    const second = createTask(workspace, context.newId(), taskData(listId, 'Second'), context);
    const before = readWorkspace(store.handle.fullDoc());
    await store.change((doc) => writeWorkspace(doc, before, workspace));
    const repository = new AutomergeWorkspaceRepository(store);
    return { store, repository, first, second, listId };
  } catch (error) {
    await store.close();
    throw error;
  }
}

test('ordinary edits preserve a pending semantic decision; explicit resolution updates the owned document', async () => {
  const { store, repository, first, second, listId } = await fixture();
  const remote = Automerge.load<WorkspaceDocument>(Automerge.save(store.handle.fullDoc()));
  try {
    const beforeRemote = readWorkspace(remote);
    const afterRemote = produce(beforeRemote, (draft) =>
      editTask(draft, second.id, { location: { listId, parentId: first.id } }, context),
    );
    const changedRemote = Automerge.change(remote, (doc) =>
      writeWorkspace(doc, beforeRemote, afterRemote),
    );
    await repository.commit(
      produce(repository.getSnapshot().workspace, (draft) =>
        editTask(draft, first.id, { location: { listId, parentId: second.id } }, context),
      ),
    );
    store.handle.update((doc) => Automerge.merge(doc, changedRemote));
    const pending = repository.getSnapshot();
    expect(pending.decisions).toHaveLength(1);
    expect(() => validateWorkspace(pending.workspace)).not.toThrow();
    const nested = Object.values(pending.workspace.tasks).find((task) => task.location.parentId)!;
    expect(() =>
      repository.commit(
        produce(pending.workspace, (draft) =>
          editTask(draft, nested.id, { location: { listId, parentId: null } }, context),
        ),
      ),
    ).toThrow('edit_conflict');
    await repository.commit(
      produce(pending.workspace, (draft) =>
        editTask(draft, first.id, { title: 'Keep this edit' }, context),
      ),
    );
    expect(
      inspectWorkspace(readWorkspace(store.handle.fullDoc())).some(
        (problem) => problem.code === 'cycle',
      ),
    ).toBe(true);
    expect(repository.getSnapshot().decisions).toHaveLength(1);
    const decision = repository.getSnapshot().decisions[0];
    expect(() =>
      repository.resolve(pending.decisions[0].id, pending.decisions[0].choices[0].id),
    ).toThrow('edit_conflict');
    await repository.resolve(decision.id, decision.choices[0].id);
    expect(repository.getSnapshot().decisions).toHaveLength(0);
    expect(repository.getSnapshot().workspace.tasks[first.id].title).toBe('Keep this edit');
    expect(() => validateWorkspace(readWorkspace(store.handle.fullDoc()))).not.toThrow();
    expect(repository.getSnapshot().saved).toBe(true);
  } finally {
    Automerge.free(remote);
    await repository.close();
  }
});

test('the application port exposes product choices and resolves native field conflicts without engine knowledge', async () => {
  const { store, repository, first } = await fixture();
  const remote = Automerge.load<WorkspaceDocument>(Automerge.save(store.handle.fullDoc()));
  try {
    const before = readWorkspace(remote);
    const after = produce(before, (draft) =>
      editTask(draft, first.id, { title: 'Remote title' }, context),
    );
    const changed = Automerge.change(remote, (doc) => writeWorkspace(doc, before, after));
    await repository.commit(
      produce(repository.getSnapshot().workspace, (draft) =>
        editTask(draft, first.id, { title: 'Local title' }, context),
      ),
    );
    store.handle.update((doc) => Automerge.merge(doc, changed));
    const decision = repository.getSnapshot().decisions[0];
    expect(decision.targets).toEqual([{ collection: 'tasks', id: first.id }]);
    expect(decision.choices.map((choice) => choice.workspace.tasks[first.id].title)).toEqual(
      expect.arrayContaining(['Local title', 'Remote title']),
    );
    expect(() =>
      repository.commit(
        produce(repository.getSnapshot().workspace, (draft) =>
          editTask(draft, first.id, { title: 'Unreviewed replacement' }, context),
        ),
      ),
    ).toThrow('edit_conflict');
    expect(() =>
      repository.commit(
        produce(repository.getSnapshot().workspace, (draft) => {
          delete draft.tasks[first.id];
        }),
      ),
    ).toThrow('edit_conflict');
    await repository.commit(
      produce(repository.getSnapshot().workspace, (draft) =>
        editTask(draft, first.id, { notes: 'An unrelated edit' }, context),
      ),
    );
    const currentDecision = repository.getSnapshot().decisions[0];
    const choice = decision.choices.find(
      (candidate) => candidate.workspace.tasks[first.id].title === 'Remote title',
    )!;
    await repository.resolve(currentDecision.id, choice.id);
    expect(repository.getSnapshot().decisions).toHaveLength(0);
    expect(repository.getSnapshot().workspace.tasks[first.id].title).toBe('Remote title');
    expect(repository.getSnapshot().workspace.tasks[first.id].notes).toBe('An unrelated edit');
  } finally {
    Automerge.free(remote);
    await repository.close();
  }
});

test('workspace mode changes cannot bypass pending review', async () => {
  const { store, repository } = await fixture();
  const remote = Automerge.load<WorkspaceDocument>(Automerge.save(store.handle.fullDoc()));
  try {
    const before = readWorkspace(remote);
    const changed = Automerge.change(remote, (doc) =>
      writeWorkspace(doc, before, { ...before, matrixMode: 'complex' }),
    );
    await repository.commit({ ...repository.getSnapshot().workspace, matrixMode: 'complex' });
    await repository.commit({ ...repository.getSnapshot().workspace, matrixMode: 'simple' });
    store.handle.update((doc) => Automerge.merge(doc, changed));
    expect(repository.getSnapshot().decisions).toHaveLength(1);

    const pending = repository.getSnapshot().workspace;
    expect(() =>
      repository.commit({
        ...pending,
        matrixMode: pending.matrixMode === 'simple' ? 'complex' : 'simple',
      }),
    ).toThrow('edit_conflict');
    const decision = repository.getSnapshot().decisions[0];
    await repository.resolve(decision.id, decision.choices[0].id);
    expect(repository.getSnapshot().decisions).toHaveLength(0);
  } finally {
    Automerge.free(remote);
    await repository.close();
  }
});

test('semantic choices project safe quantities and preserve the independent correction decision', async () => {
  const { store, repository } = await fixture();
  const habitId = context.newId();
  const replicas: Automerge.Doc<WorkspaceDocument>[] = [];
  try {
    await repository.commit(
      produce(repository.getSnapshot().workspace, (draft) => {
        createHabit(
          draft,
          habitId,
          {
            name: 'Water',
            color: '#123456',
            icon: 'glass-water',
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
                weeklyTarget: 3,
                intervalDays: 1,
              },
            ],
          },
          context,
        );
        recordCheckIn(draft, habitId, '2026-10-23', { value: 1 }, context);
      }),
    );
    const binary = Automerge.save(store.handle.fullDoc());
    for (let index = 0; index < 2; index++) {
      const replica = Automerge.load<WorkspaceDocument>(binary);
      replicas.push(replica);
      const before = readWorkspace(replica);
      const next = produce(before, (draft) =>
        incrementCheckIn(draft, habitId, '2026-10-23', -1, context),
      );
      const changed = Automerge.change(replica, (doc) => writeWorkspace(doc, before, next));
      replicas[index] = changed;
    }
    await repository.commit(
      produce(repository.getSnapshot().workspace, (draft) => removeHabit(draft, habitId)),
    );
    for (const replica of replicas) {
      store.handle.update((doc) => Automerge.merge(doc, replica));
    }
    const semantic = repository
      .getSnapshot()
      .decisions.find((decision) => decision.code === 'not_found')!;
    const retained = semantic.choices.find((choice) => choice.workspace.habits[habitId])!;
    const checkIn = Object.values(retained.workspace.checkIns)[0];
    expect(quantityValue(checkIn.quantity)).toBe(0);
    await repository.resolve(semantic.id, retained.id);
    expect(
      quantityValue(Object.values(readWorkspace(store.handle.fullDoc()).checkIns)[0].quantity),
    ).toBe(-1);
    expect(repository.getSnapshot().decisions.length).toBeGreaterThan(0);
    expect(
      quantityValue(Object.values(repository.getSnapshot().workspace.checkIns)[0].quantity),
    ).toBe(0);
    expect(() =>
      repository.commit(
        produce(repository.getSnapshot().workspace, (draft) =>
          incrementCheckIn(draft, habitId, '2026-10-23', 1, context),
        ),
      ),
    ).toThrow('edit_conflict');
  } finally {
    for (const replica of replicas) {
      Automerge.free(replica);
    }
    await repository.close();
  }
});

test('weekly goals retain grouping and add concurrent offline amounts when real replicas reconnect', async () => {
  const { store, repository } = await fixture();
  const habitId = context.newId();
  const replicas: Automerge.Doc<WorkspaceDocument>[] = [];
  try {
    await repository.commit(
      produce(repository.getSnapshot().workspace, (draft) => {
        createHabit(
          draft,
          habitId,
          {
            name: 'Weekly practice',
            color: '#7eb4b4',
            icon: 'guitar',
            timeOfDay: 'evening',
            archived: false,
            startDate: '2026-10-19',
            reminderTime: null,
            zone: 'UTC',
            rank: 'a0',
            rules: [
              {
                from: '2026-10-19',
                kind: 'quantity',
                goal: 60,
                unit: 'min',
                step: 10,
                frequency: 'weekly-total',
                weekdays: [],
                weeklyTarget: 3,
                intervalDays: 1,
              },
            ],
          },
          context,
        );
      }),
    );
    const binary = Automerge.save(store.handle.fullDoc());
    for (const value of [10, 15]) {
      const replica = Automerge.load<WorkspaceDocument>(binary);
      const before = readWorkspace(replica);
      const next = produce(before, (draft) =>
        incrementCheckIn(draft, habitId, '2026-10-23', value, context),
      );
      replicas.push(Automerge.change(replica, (doc) => writeWorkspace(doc, before, next)));
    }
    for (const replica of replicas) {
      store.handle.update((doc) => Automerge.merge(doc, replica));
    }
    await repository.flush();
    const restored = Automerge.load<WorkspaceDocument>(Automerge.save(store.handle.fullDoc()));
    replicas.push(restored);
    const workspace = readWorkspace(restored);
    const habit = workspace.habits[habitId];
    expect(habit.timeOfDay).toBe('evening');
    const logs = Object.values(workspace.checkIns).map((log) => ({
      ...log,
      value: quantityValue(log.quantity),
    }));
    expect(weeklyHabitAmount(habit, logs, '2026-10-23', 1)).toMatchObject({
      value: 25,
      goal: 60,
      unit: 'min',
    });
    expect(repository.getSnapshot().decisions).toEqual([]);
    expect(() => validateWorkspace(workspace)).not.toThrow();
  } finally {
    for (const replica of replicas) {
      Automerge.free(replica);
    }
    await repository.close();
  }
});
