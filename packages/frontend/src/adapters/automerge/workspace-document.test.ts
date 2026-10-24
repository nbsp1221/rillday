import * as Automerge from '@automerge/automerge';
import {
  type Workspace,
  completeTask,
  createHabit,
  createLabel,
  createTask,
  createWorkspace,
  editLabel,
  editTask,
  incrementCheckIn,
  inspectWorkspace,
  purgeTask,
  quantityValue,
  recordCheckIn,
  removeLabel,
  taskData,
  trashTask,
  validateWorkspace,
} from '@repo/domain';
import { produce } from 'immer';
import { expect, test } from 'vitest';
import {
  type WorkspaceDocument,
  documentConflicts,
  emptyDocument,
  readWorkspace,
  recordVersion,
  resolveDocumentConflict,
  writeWorkspace,
} from './workspace-document.ts';

const context = { now: () => '2026-10-23T10:00:00.000Z', newId: () => crypto.randomUUID() };

function fixture() {
  const state = createWorkspace(context);
  const listId = Object.keys(state.lists)[0];
  const task = createTask(
    state,
    context.newId(),
    taskData(listId, 'Review', {
      schedule: {
        date: '2026-10-23',
        time: null,
        zone: null,
        durationMinutes: 30,
        repeat: { frequency: 'daily', interval: 1, until: null, anchorDay: null },
        reminderMinutes: null,
      },
    }),
    context,
  );
  const empty: Workspace = {
    tasks: {},
    lists: {},
    labels: {},
    habits: {},
    checkIns: {},
    quadrants: {},
    matrixMode: 'simple',
  };
  const doc = Automerge.change(Automerge.from(emptyDocument()), (draft) =>
    writeWorkspace(draft, empty, state),
  );
  return { doc, task, listId };
}

function change(doc: Automerge.Doc<WorkspaceDocument>, update: (draft: Workspace) => void) {
  const before = readWorkspace(doc);
  const after = produce(before, update);
  validateWorkspace(after);
  return Automerge.change(doc, (draft) => writeWorkspace(draft, before, after));
}

test('field encoding preserves disjoint changes and offers actual conflicting title alternatives', () => {
  const { doc, task } = fixture();
  const left = change(Automerge.clone(doc), (draft) =>
    editTask(draft, task.id, { title: 'Local title' }, context),
  );
  const right = change(Automerge.clone(doc), (draft) =>
    editTask(draft, task.id, { priority: 3 }, context),
  );
  const disjoint = Automerge.merge(left, right);
  expect(readWorkspace(disjoint).tasks[task.id]).toMatchObject({
    title: 'Local title',
    priority: 3,
  });
  expect(documentConflicts(disjoint)).toHaveLength(0);
  const competing = change(Automerge.clone(doc), (draft) =>
    editTask(draft, task.id, { title: 'Remote title' }, context),
  );
  let merged = Automerge.merge(disjoint, competing);
  const conflict = documentConflicts(merged).find((entry) => entry.field === 'title')!;
  expect(conflict.options.map((option) => option.value)).toEqual(
    expect.arrayContaining(['Local title', 'Remote title']),
  );
  const version = recordVersion(merged, { collection: 'tasks', id: task.id });
  merged = Automerge.change(merged, (draft) =>
    resolveDocumentConflict(draft, conflict, conflict.options[0].id),
  );
  expect(documentConflicts(merged)).toHaveLength(0);
  expect(recordVersion(merged, { collection: 'tasks', id: task.id })).not.toBe(version);
});

test('parallel completion produces one next occurrence without conflicting record containers', () => {
  const { doc, task } = fixture();
  const left = change(Automerge.clone(doc), (draft) => completeTask(draft, task.id, true, context));
  const right = change(Automerge.clone(doc), (draft) =>
    completeTask(draft, task.id, true, context),
  );
  const merged = Automerge.merge(left, right);
  const workspace = readWorkspace(merged);
  expect(
    Object.values(workspace.tasks).filter((candidate) => candidate.generatedFromId === task.id),
  ).toHaveLength(1);
  expect(documentConflicts(merged)).toHaveLength(0);
  expect(() => validateWorkspace(workspace)).not.toThrow();
});

test('a concurrent stale edit cannot resurrect a purged task', () => {
  const { doc, task } = fixture();
  const purged = change(Automerge.clone(doc), (draft) => {
    trashTask(draft, task.id, context);
    purgeTask(draft, task.id, context);
  });
  const stale = change(Automerge.clone(doc), (draft) =>
    editTask(draft, task.id, { title: 'Edited before deletion arrived' }, context),
  );
  const merged = Automerge.merge(purged, stale);
  const workspace = readWorkspace(merged);
  expect(workspace.tasks[task.id].purgedAt).toBe(context.now());
  expect(() => editTask(workspace, task.id, { title: 'Resurrected' }, context)).toThrow();
  expect(() =>
    createTask(workspace, task.id, taskData(task.location.listId, 'Reused'), context),
  ).toThrow();
  expect(inspectWorkspace(workspace)).toEqual([]);
  const conflicts = documentConflicts(merged);
  expect(conflicts.length).toBeGreaterThan(0);
  for (const conflict of conflicts) {
    for (const option of conflict.options) {
      const resolved = Automerge.change(Automerge.clone(merged), (draft) =>
        resolveDocumentConflict(draft, conflict, option.id),
      );
      expect(readWorkspace(resolved).tasks[task.id].purgedAt).toBe(context.now());
    }
  }
});

test('resolving a label name preserves an independent delete/edit decision', () => {
  const { doc } = fixture();
  const id = context.newId();
  const initial = change(doc, (draft) => createLabel(draft, id, { name: 'Review', color: null }));
  const left = change(Automerge.clone(initial), (draft) => editLabel(draft, id, { name: 'Local' }));
  const right = change(Automerge.clone(initial), (draft) =>
    editLabel(draft, id, { name: 'Remote' }),
  );
  const deleted = change(Automerge.clone(initial), (draft) => removeLabel(draft, id, context));
  let merged = Automerge.merge(Automerge.merge(left, right), deleted);
  const name = documentConflicts(merged).find((entry) => entry.field === 'name')!;
  const existence = documentConflicts(merged).find((entry) => entry.field === '$presence')!;
  expect(name).toBeDefined();
  expect(existence).toBeDefined();
  merged = Automerge.change(merged, (draft) =>
    resolveDocumentConflict(draft, name, name.options[0].id),
  );
  const remaining = documentConflicts(merged);
  expect(remaining).toHaveLength(1);
  expect(remaining[0]).toMatchObject({ id: existence.id, options: existence.options });
  merged = Automerge.change(merged, (draft) =>
    resolveDocumentConflict(
      draft,
      remaining[0],
      remaining[0].options.find((option) => (option.value as { alive: boolean }).alive)!.id,
    ),
  );
  expect(documentConflicts(merged)).toHaveLength(0);
  expect(readWorkspace(merged).labels[id].name).toBe(name.options[0].value);
});

test('confirming deletion retires conflicts on the deleted record without erasing native history', () => {
  const { doc } = fixture();
  const id = context.newId();
  const initial = change(doc, (draft) => createLabel(draft, id, { name: 'Review', color: null }));
  const local = change(Automerge.clone(initial), (draft) =>
    editLabel(draft, id, { name: 'Local' }),
  );
  const remote = change(Automerge.clone(initial), (draft) =>
    editLabel(draft, id, { name: 'Remote' }),
  );
  const deleted = change(Automerge.clone(initial), (draft) => removeLabel(draft, id, context));
  const merged = Automerge.merge(Automerge.merge(local, remote), deleted);
  const conflicts = documentConflicts(merged);
  const presence = conflicts.find((entry) => entry.field === '$presence')!;
  const deletion = presence.options.find((option) => !(option.value as { alive: boolean }).alive)!;
  const resolved = Automerge.change(merged, (draft) =>
    resolveDocumentConflict(draft, presence, deletion.id),
  );
  expect(readWorkspace(resolved).labels[id]).toBeUndefined();
  expect(documentConflicts(resolved)).toEqual([]);
  const name = conflicts.find((entry) => entry.field === 'name')!;
  expect(Automerge.getConflicts(resolved.fields, name.id)).toBeDefined();
});

test('domain validation inside a native change rolls back invalid task relationships atomically', () => {
  const { doc, task, listId } = fixture();
  const withChild = change(doc, (draft) => {
    createTask(
      draft,
      context.newId(),
      taskData(listId, 'Child', { location: { listId, parentId: task.id } }),
      context,
    );
  });
  const child = Object.values(readWorkspace(withChild).tasks).find(
    (candidate) => candidate.id !== task.id,
  )!;
  const before = Automerge.getHeads(withChild);
  expect(() =>
    Automerge.change(withChild, (draft) => {
      const state = readWorkspace(draft);
      const invalid = produce(state, (next) => {
        next.tasks[task.id].location.parentId = child.id;
      });
      writeWorkspace(draft, state, invalid);
      validateWorkspace(readWorkspace(draft));
    }),
  ).toThrow('cycle');
  expect(Automerge.getHeads(withChild)).toEqual(before);
  expect(readWorkspace(withChild).tasks[task.id].location.parentId).toBeNull();
});

function quantityFixture(value?: number) {
  const { doc } = fixture();
  const habitId = context.newId();
  const initial = change(doc, (draft) => {
    createHabit(
      draft,
      habitId,
      {
        name: 'Water',
        color: '#123456',
        icon: 'glass-water',
        archived: false,
        startDate: '2026-10-01',
        rules: [
          {
            from: '2026-10-01',
            kind: 'quantity',
            goal: 8,
            unit: 'cups',
            step: 0.1,
            frequency: 'daily',
            weekdays: [],
            weeklyTarget: 3,
            intervalDays: 1,
          },
        ],
        reminderTime: null,
        zone: 'UTC',
        rank: 'a0',
      },
      context,
    );
    if (value !== undefined) {
      recordCheckIn(draft, habitId, '2026-10-23', { value }, context);
    }
  });
  return { initial, habitId };
}

test('quantity entries merge through native map operations and unseen corrections await explicit review', () => {
  const { initial, habitId } = quantityFixture();
  const left = change(Automerge.clone(initial), (draft) =>
    incrementCheckIn(draft, habitId, '2026-10-23', 0.1, context),
  );
  const right = change(Automerge.clone(initial), (draft) =>
    incrementCheckIn(draft, habitId, '2026-10-23', 0.2, context),
  );
  const merged = Automerge.merge(left, right);
  const log = Object.values(readWorkspace(merged).checkIns)[0];
  expect(quantityValue(log.quantity)).toBe(0.3);
  expect(documentConflicts(merged)).toHaveLength(0);
  const corrected = change(Automerge.clone(merged), (draft) =>
    recordCheckIn(draft, habitId, '2026-10-23', { value: 10 }, context),
  );
  const added = change(Automerge.clone(merged), (draft) =>
    incrementCheckIn(draft, habitId, '2026-10-23', 1, context),
  );
  let conflictDoc = Automerge.merge(corrected, added);
  const result = Object.values(readWorkspace(conflictDoc).checkIns)[0];
  expect(quantityValue(result.quantity)).toBe(10);
  expect(
    Object.values(result.quantity.adjustments).some(
      (entry) => entry.generation !== result.quantity.generation,
    ),
  ).toBe(true);
  expect(inspectWorkspace(readWorkspace(conflictDoc))).toEqual([
    { code: 'quantity_correction_conflict', targets: [{ collection: 'checkIns', id: result.id }] },
  ]);
  const conflict = documentConflicts(conflictDoc).find((entry) => entry.field === '$quantity')!;
  expect(conflict.options.map((option) => option.value)).toEqual(expect.arrayContaining([10, 11]));
  conflictDoc = Automerge.change(conflictDoc, (draft) =>
    resolveDocumentConflict(draft, conflict, '11'),
  );
  expect(quantityValue(readWorkspace(conflictDoc).checkIns[result.id].quantity)).toBe(11);
  expect(documentConflicts(conflictDoc)).toHaveLength(0);
  expect(() => validateWorkspace(readWorkspace(conflictDoc))).not.toThrow();
});

test.each([
  { start: 1, delta: -1, mergedValue: -1, chosen: 0 },
  { start: 999000000, delta: 1000000, mergedValue: 1001000000, chosen: 1000000000 },
])(
  'a concurrent quantity aggregate of $mergedValue remains readable and requires review',
  ({ start, delta, mergedValue, chosen }) => {
    const { initial, habitId } = quantityFixture(start);
    const left = change(Automerge.clone(initial), (draft) =>
      incrementCheckIn(draft, habitId, '2026-10-23', delta, context),
    );
    const right = change(Automerge.clone(initial), (draft) =>
      incrementCheckIn(draft, habitId, '2026-10-23', delta, context),
    );
    let merged = Automerge.merge(left, right);
    const log = Object.values(readWorkspace(merged).checkIns)[0];
    expect(quantityValue(log.quantity)).toBe(mergedValue);
    expect(inspectWorkspace(readWorkspace(merged))).toEqual([
      { code: 'quantity_out_of_range', targets: [{ collection: 'checkIns', id: log.id }] },
    ]);
    const conflict = documentConflicts(merged).find((entry) => entry.field === '$quantity')!;
    expect(conflict.options.map((option) => option.value)).toContain(chosen);
    merged = Automerge.change(merged, (draft) =>
      resolveDocumentConflict(draft, conflict, String(chosen)),
    );
    expect(quantityValue(readWorkspace(merged).checkIns[log.id].quantity)).toBe(chosen);
    expect(documentConflicts(merged)).toHaveLength(0);
    expect(() => validateWorkspace(readWorkspace(merged))).not.toThrow();
  },
);

test('a stale review cannot overwrite a newer quantity edit', () => {
  const { initial, habitId } = quantityFixture();
  const corrected = change(Automerge.clone(initial), (draft) =>
    recordCheckIn(draft, habitId, '2026-10-23', { value: 10 }, context),
  );
  const added = change(Automerge.clone(initial), (draft) =>
    incrementCheckIn(draft, habitId, '2026-10-23', 1, context),
  );
  let merged = Automerge.merge(corrected, added);
  const conflict = documentConflicts(merged).find((entry) => entry.field === '$quantity')!;
  merged = Automerge.change(merged, (draft) => {
    const before = readWorkspace(draft);
    const next = produce(before, (state) =>
      recordCheckIn(state, habitId, '2026-10-23', { value: 20 }, context),
    );
    writeWorkspace(draft, before, next);
  });
  expect(() =>
    Automerge.change(merged, (draft) => resolveDocumentConflict(draft, conflict, '10')),
  ).toThrow('edit_conflict');
  expect(quantityValue(Object.values(readWorkspace(merged).checkIns)[0].quantity)).toBe(20);
});

test('concurrent manual corrections remain separate choices instead of being added together', () => {
  const { initial, habitId } = quantityFixture(1);
  const left = change(Automerge.clone(initial), (draft) =>
    recordCheckIn(draft, habitId, '2026-10-23', { value: 10 }, context),
  );
  const right = change(Automerge.clone(initial), (draft) =>
    recordCheckIn(draft, habitId, '2026-10-23', { value: 20 }, context),
  );
  let merged = Automerge.merge(left, right);
  const conflict = documentConflicts(merged).find((entry) => entry.field === '$quantity')!;
  expect(
    conflict.options.map((option) => option.value).sort((a, b) => Number(a) - Number(b)),
  ).toEqual([10, 20]);
  merged = Automerge.change(merged, (draft) => resolveDocumentConflict(draft, conflict, '20'));
  expect(documentConflicts(merged)).toHaveLength(0);
  expect(() => validateWorkspace(readWorkspace(merged))).not.toThrow();
});
