import * as Automerge from '@automerge/automerge';
import {
  type Workspace,
  compareWorkspaceReviewChoices,
  completeTask,
  createHabit,
  createLabel,
  createTask,
  createWorkspace,
  editHabit,
  editLabel,
  editTask,
  incrementCheckIn,
  inspectWorkspace,
  purgeTask,
  quantityValue,
  recordCheckIn,
  removeHabit,
  removeLabel,
  taskData,
  trashTask,
  validateWorkspace,
} from '@repo/domain';
import { produce } from 'immer';
import { expect, test } from 'vitest';
import {
  type WorkspaceDocument,
  emptyDocument,
  readWorkspace,
  writeWorkspace,
} from './workspace-document.ts';
import { type SemanticReview, inspectDocument, selectSemanticReview } from './workspace-review.ts';

const context = { now: () => '2026-10-23T10:00:00.000Z', newId: () => crypto.randomUUID() };

function resolveSemanticReview(
  doc: Automerge.Doc<WorkspaceDocument>,
  review: SemanticReview,
  choice: string,
) {
  const before = readWorkspace(doc);
  const after = selectSemanticReview(doc, review, choice);
  return Automerge.change(doc, (draft) => writeWorkspace(draft, before, after));
}

function fixture(recurring = false) {
  const workspace = createWorkspace(context);
  const listId = Object.keys(workspace.lists)[0];
  const first = createTask(
    workspace,
    context.newId(),
    taskData(
      listId,
      'First',
      recurring
        ? {
            schedule: {
              date: '2026-10-23',
              time: null,
              zone: null,
              durationMinutes: 30,
              repeat: { frequency: 'daily', interval: 1, until: null, anchorDay: null },
              reminderMinutes: null,
            },
          }
        : {},
    ),
    context,
  );
  const second = createTask(workspace, context.newId(), taskData(listId, 'Second'), context);
  const unrelated = createTask(workspace, context.newId(), taskData(listId, 'Unrelated'), context);
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
    writeWorkspace(draft, empty, workspace),
  );
  return { doc, first, second, unrelated, listId };
}

function change(doc: Automerge.Doc<WorkspaceDocument>, recipe: (draft: Workspace) => void) {
  const before = readWorkspace(doc);
  const after = produce(before, recipe);
  validateWorkspace(after);
  return Automerge.change(doc, (draft) => writeWorkspace(draft, before, after));
}

function withHabit(doc: Automerge.Doc<WorkspaceDocument>, startDate = '2026-10-01') {
  const habitId = context.newId();
  const data = {
    name: 'Water',
    color: '#123456',
    icon: 'glass-water',
    archived: false,
    startDate,
    reminderTime: null,
    zone: 'UTC',
    rank: 'a0',
    rules: [
      {
        from: startDate,
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
  };
  const initial = change(doc, (draft) => createHabit(draft, habitId, data, context));
  return { initial, habitId, data };
}

test('a concurrent parent cycle stays pending while disjoint edits remain visible and either valid move can be chosen', () => {
  const { doc, first, second, unrelated, listId } = fixture();
  const left = change(Automerge.clone(doc), (draft) => {
    editTask(
      draft,
      first.id,
      { location: { listId, parentId: second.id }, title: 'Keep this title' },
      context,
    );
    editTask(draft, unrelated.id, { notes: 'Keep these notes' }, context);
  });
  const right = change(Automerge.clone(doc), (draft) => {
    editTask(draft, second.id, { location: { listId, parentId: first.id }, priority: 3 }, context);
  });
  const merged = Automerge.merge(left, right);
  expect(inspectWorkspace(readWorkspace(merged)).map((problem) => problem.code)).toEqual(['cycle']);
  const heads = Automerge.getHeads(merged);
  const inspection = inspectDocument(merged, readWorkspace(left));
  expect(inspection.semantic?.options).toHaveLength(2);
  expect(() => validateWorkspace(inspection.workspace)).not.toThrow();
  expect(inspection.workspace.tasks[first.id].location.parentId).toBe(second.id);
  expect(inspection.workspace.tasks[first.id].title).toBe('Keep this title');
  expect(inspection.workspace.tasks[second.id].priority).toBe(3);
  expect(inspection.workspace.tasks[unrelated.id].notes).toBe('Keep these notes');
  expect(Automerge.getHeads(merged)).toEqual(heads);
  const choice = inspection.semantic!.options.find(
    (option) => option.workspace.tasks[second.id].location.parentId === first.id,
  )!;
  const resolved = resolveSemanticReview(merged, inspection.semantic!, choice.id);
  expect(inspectDocument(resolved).semantic).toBeUndefined();
  expect(readWorkspace(resolved).tasks[first.id]).toMatchObject({
    title: 'Keep this title',
    location: { parentId: null },
  });
  expect(readWorkspace(resolved).tasks[second.id]).toMatchObject({
    priority: 3,
    location: { parentId: first.id },
  });
});

test('pending semantic decisions survive binary reload and stale confirmation cannot replace a newer edit', () => {
  const { doc, first, second, unrelated, listId } = fixture();
  const left = change(Automerge.clone(doc), (draft) =>
    editTask(draft, first.id, { location: { listId, parentId: second.id } }, context),
  );
  const right = change(Automerge.clone(doc), (draft) =>
    editTask(draft, second.id, { location: { listId, parentId: first.id } }, context),
  );
  const merged = Automerge.load<WorkspaceDocument>(Automerge.save(Automerge.merge(left, right)));
  const pending = inspectDocument(merged);
  expect(pending.semantic?.options).toHaveLength(2);
  const newer = Automerge.change(merged, (draft) => {
    const before = readWorkspace(draft);
    const after = produce(before, (workspace) => {
      workspace.tasks[unrelated.id].title = 'Newer edit';
    });
    writeWorkspace(draft, before, after);
  });
  expect(() =>
    resolveSemanticReview(newer, pending.semantic!, pending.semantic!.options[0].id),
  ).toThrow('edit_conflict');
  expect(inspectDocument(newer).workspace.tasks[unrelated.id].title).toBe('Newer edit');
});

test('reopening cannot hide an edited next occurrence or its newly added child before explicit review', () => {
  const { doc, first, listId } = fixture(true);
  const completed = change(doc, (draft) => completeTask(draft, first.id, true, context));
  const next = Object.values(readWorkspace(completed).tasks).find(
    (task) => task.generatedFromId === first.id,
  )!;
  const reopened = change(Automerge.clone(completed), (draft) =>
    completeTask(draft, first.id, false, context),
  );
  const childId = context.newId();
  const edited = change(Automerge.clone(completed), (draft) => {
    editTask(draft, next.id, { title: 'Keep this next occurrence' }, context);
    createTask(
      draft,
      childId,
      taskData(listId, 'New child', { location: { listId, parentId: next.id } }),
      context,
    );
    editTask(draft, first.id, { notes: 'Unrelated parent note' }, context);
  });
  const merged = Automerge.merge(reopened, edited);
  const inspection = inspectDocument(merged);
  expect(inspection.semantic?.options).toHaveLength(2);
  expect(inspection.workspace.tasks[next.id]).toMatchObject({
    title: 'Keep this next occurrence',
    voided: false,
    trashedAt: null,
  });
  expect(inspection.workspace.tasks[childId].title).toBe('New child');
  expect(inspection.workspace.tasks[first.id].notes).toBe('Unrelated parent note');
  expect(() => validateWorkspace(inspection.workspace)).not.toThrow();
  const keep = inspection.semantic!.options.find(
    (option) => !option.workspace.tasks[next.id].voided,
  )!;
  const result = resolveSemanticReview(merged, inspection.semantic!, keep.id);
  expect(inspectDocument(result).semantic).toBeUndefined();
  expect(() => validateWorkspace(readWorkspace(result))).not.toThrow();
  const omitted = structuredClone(inspection.workspace);
  delete omitted.tasks[next.id];
  delete omitted.tasks[childId];
  expect(
    compareWorkspaceReviewChoices(
      omitted,
      inspection.workspace,
      inspection.semantic!.problems,
      omitted,
    ),
  ).toBeGreaterThan(0);
});

test('a delete/edit conflict keeps the edited record visible until the deletion is explicitly selected', () => {
  const { doc } = fixture();
  const id = context.newId();
  const initial = change(doc, (draft) => createLabel(draft, id, { name: 'Review', color: null }));
  const deleted = change(Automerge.clone(initial), (draft) => removeLabel(draft, id, context));
  const edited = change(Automerge.clone(initial), (draft) =>
    editLabel(draft, id, { name: 'Edited-label' }),
  );
  const inspection = inspectDocument(Automerge.merge(deleted, edited));
  expect(inspection.workspace.labels[id].name).toBe('Edited-label');
  expect(inspection.conflicts).toHaveLength(1);
  expect(inspection.conflicts[0].field).toBe('$presence');
});

test('removing a label concurrently with attaching it offers valid decisions without dropping unrelated task edits', () => {
  const { doc, first } = fixture();
  const id = context.newId();
  const initial = change(doc, (draft) => createLabel(draft, id, { name: 'Review', color: null }));
  const deleted = change(Automerge.clone(initial), (draft) => removeLabel(draft, id, context));
  const assigned = change(Automerge.clone(initial), (draft) =>
    editTask(draft, first.id, { labelIds: [id], title: 'Keep this title' }, context),
  );
  const merged = Automerge.merge(deleted, assigned);
  const inspection = inspectDocument(merged);
  expect(inspection.semantic?.options).toHaveLength(2);
  expect(() => validateWorkspace(inspection.workspace)).not.toThrow();
  for (const option of inspection.semantic!.options) {
    expect(option.workspace.tasks[first.id].title).toBe('Keep this title');
  }
});

test('restoring a referenced parent includes the label required by that parent', () => {
  const { doc, first, second, listId } = fixture();
  const labelId = context.newId();
  const initial = change(doc, (draft) => {
    createLabel(draft, labelId, { name: 'Review', color: null });
    editTask(draft, first.id, { labelIds: [labelId] }, context);
  });
  const removed = change(Automerge.clone(initial), (draft) => {
    trashTask(draft, first.id, context);
    purgeTask(draft, first.id, context);
    removeLabel(draft, labelId, context);
  });
  const nested = change(Automerge.clone(initial), (draft) => {
    editTask(
      draft,
      second.id,
      { location: { listId, parentId: first.id }, notes: 'Keep this note' },
      context,
    );
  });
  const inspection = inspectDocument(Automerge.merge(removed, nested));
  expect(inspection.semantic?.options).toHaveLength(2);
  const keepParent = inspection.semantic!.options.find(
    (option) => option.workspace.tasks[second.id].location.parentId === first.id,
  )!;
  expect(keepParent.workspace.labels[labelId].name).toBe('Review');
  expect(keepParent.workspace.tasks[second.id].notes).toBe('Keep this note');
  expect(() => validateWorkspace(keepParent.workspace)).not.toThrow();
});

test('choosing a valid label name does not decide its independent delete/edit conflict', () => {
  const { doc } = fixture();
  const firstId = context.newId();
  const secondId = context.newId();
  const initial = change(doc, (draft) => {
    createLabel(draft, firstId, { name: 'Alpha', color: null });
    createLabel(draft, secondId, { name: 'Beta', color: null });
  });
  const left = change(Automerge.clone(initial), (draft) =>
    editLabel(draft, firstId, { name: 'Common' }),
  );
  const right = change(Automerge.clone(initial), (draft) =>
    editLabel(draft, secondId, { name: 'Common' }),
  );
  const removed = change(Automerge.clone(initial), (draft) => removeLabel(draft, firstId, context));
  const merged = Automerge.merge(Automerge.merge(left, right), removed);
  const inspection = inspectDocument(merged);
  const choice = inspection.semantic!.options.find(
    (option) => option.workspace.labels[firstId]?.name === 'Alpha',
  )!;
  const resolved = inspectDocument(resolveSemanticReview(merged, inspection.semantic!, choice.id));
  expect(resolved.semantic).toBeUndefined();
  expect(resolved.workspace.labels[firstId].name).toBe('Alpha');
  expect(
    resolved.conflicts.some(
      (conflict) => conflict.target.id === firstId && conflict.field === '$presence',
    ),
  ).toBe(true);
});

test('coupled habit dates and rules remain valid atomic alternatives under concurrent edits', () => {
  const { doc } = fixture();
  const { initial, habitId, data } = withHabit(doc, '2026-11-01');
  const moved = change(Automerge.clone(initial), (draft) => {
    editHabit(
      draft,
      habitId,
      {
        ...data,
        startDate: '2026-11-02',
        rules: [{ ...data.rules[0], from: '2026-11-02', goal: 10 }],
      },
      0,
      context,
    );
  });
  const revised = change(Automerge.clone(initial), (draft) => {
    editHabit(
      draft,
      habitId,
      {
        ...data,
        name: 'Keep this name',
        color: '#abcdef',
        rules: [{ ...data.rules[0], goal: 12 }],
      },
      0,
      context,
    );
  });
  const inspection = inspectDocument(Automerge.merge(moved, revised));
  const habit = inspection.workspace.habits[habitId];
  expect(habit.startDate).toBe(habit.rules[0].from);
  expect(habit.name).toBe('Keep this name');
  expect(habit.color).toBe('#abcdef');
  expect(inspection.semantic).toBeUndefined();
  expect(
    inspection.conflicts.find((conflict) => conflict.field === 'habitSchedule')?.options,
  ).toHaveLength(2);
  expect(() => validateWorkspace(inspection.workspace)).not.toThrow();
});

test('a semantic deletion choice safely coexists with a pending quantity correction', () => {
  const { doc } = fixture();
  const { initial, habitId } = withHabit(doc);
  const logged = change(initial, (draft) =>
    recordCheckIn(draft, habitId, '2026-10-23', { value: 1 }, context),
  );
  const removed = change(Automerge.clone(logged), (draft) => removeHabit(draft, habitId));
  const corrected = change(Automerge.clone(logged), (draft) =>
    recordCheckIn(draft, habitId, '2026-10-23', { value: 10, note: 'Keep this note' }, context),
  );
  const incremented = change(Automerge.clone(logged), (draft) => {
    incrementCheckIn(draft, habitId, '2026-10-23', 1, context);
    recordCheckIn(draft, habitId, '2026-10-23', { skipped: true }, context);
  });
  const previous = readWorkspace(removed);
  const merged = Automerge.merge(Automerge.merge(removed, corrected), incremented);
  const inspection = inspectDocument(merged, previous);
  expect(inspection.workspace.habits[habitId]).toBeUndefined();
  expect(Object.keys(inspection.workspace.checkIns)).toHaveLength(0);
  expect(inspection.conflicts.some((conflict) => conflict.field === '$quantity')).toBe(true);
  const keep = inspection.semantic!.options.find((option) => option.workspace.habits[habitId])!;
  const log = Object.values(keep.workspace.checkIns)[0];
  expect(log.note).toBe('Keep this note');
  expect(log.skipped).toBe(true);
  expect(quantityValue(log.quantity)).toBe(10);
  expect(
    inspectWorkspace(keep.workspace).some(
      (problem) => problem.code === 'quantity_correction_conflict',
    ),
  ).toBe(true);
});

test('label naming alternatives preserve independent color and notes while expanding new references', () => {
  const { doc, first } = fixture();
  const labelId = context.newId();
  const newId = context.newId();
  const initial = change(doc, (draft) =>
    createLabel(draft, labelId, { name: 'Alpha', color: null }),
  );
  const added = change(Automerge.clone(initial), (draft) => {
    createLabel(draft, newId, { name: 'Collision', color: '#ff0000' });
    editLabel(draft, labelId, { color: '#0000ff' });
    editTask(draft, first.id, { labelIds: [newId], notes: 'Keep these notes' }, context);
  });
  const renamed = change(Automerge.clone(initial), (draft) =>
    editLabel(draft, labelId, { name: 'Collision' }),
  );
  const inspection = inspectDocument(Automerge.merge(added, renamed));
  expect(inspection.semantic?.options).toHaveLength(2);
  for (const option of inspection.semantic!.options) {
    expect(option.workspace.labels[labelId].color).toBe('#0000ff');
    expect(option.workspace.tasks[first.id].notes).toBe('Keep these notes');
    expect(() => validateWorkspace(option.workspace)).not.toThrow();
  }
  const renamedOption = inspection.semantic!.options.find(
    (option) => option.workspace.labels[labelId].name === 'Collision',
  )!;
  expect(renamedOption.workspace.labels[newId]).toBeUndefined();
  expect(renamedOption.workspace.tasks[first.id].labelIds).toEqual([]);
});
