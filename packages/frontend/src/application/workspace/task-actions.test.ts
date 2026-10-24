import { expect, test, vi } from 'vitest';
import {
  type Task,
  type TaskActionPort,
  type WorkspaceSnapshot,
  addDays,
  createTaskActions,
  createTaskRecord,
  dateKey,
  emptyWorkspace,
  matrixTaskPatch,
  prepareTaskCapture,
  reorderTask,
} from './index.ts';

function fixture() {
  const state: WorkspaceSnapshot = {
    data: emptyWorkspace(),
    saveState: 'saved',
    error: '',
    syncState: 'local',
    pending: 0,
    issues: [],
    canUndo: false,
    canRedo: false,
  };
  const port = {
    getSnapshot: () => state,
    apply: vi.fn<TaskActionPort['apply']>((input) => {
      const draft = structuredClone(state.data);
      for (const intent of Array.isArray(input) ? input : [input]) {
        if (intent.type === 'task.create') {
          draft.tasks.push(...intent.tasks);
        }
        if (intent.type === 'task.update') {
          Object.assign(
            draft.tasks.find((task) => task.id === intent.id)!,
            intent.patch,
          );
        }
        if (intent.type === 'task.reorder') {
          reorderTask(draft, intent.from, intent.to, intent.placement);
        }
      }
      state.data = draft;
    }),
    completeTask: vi.fn<TaskActionPort['completeTask']>(),
    trashTask: vi.fn<TaskActionPort['trashTask']>(),
    restoreTask: vi.fn<TaskActionPort['restoreTask']>(),
    purgeTasks: vi.fn<TaskActionPort['purgeTasks']>(),
    duplicateTask: vi.fn<TaskActionPort['duplicateTask']>(() => 'copy'),
    undo: vi.fn<TaskActionPort['undo']>(),
    redo: vi.fn<TaskActionPort['redo']>(),
  } satisfies TaskActionPort;
  const commands = [
    port.apply,
    port.completeTask,
    port.trashTask,
    port.restoreTask,
    port.purgeTasks,
    port.duplicateTask,
    port.undo,
    port.redo,
  ];

  function add(options: Partial<Task> = {}) {
    const task = createTaskRecord('Task to review', state.data, options);
    expect.assert(task);
    state.data.tasks.push(task);

    return task;
  }

  return {
    state,
    port,
    commands,
    add,
    actions: createTaskActions(port),
    fail: (code: string) => {
      for (const command of commands) {
        command.mockImplementation(() => {
          throw new Error(code);
        });
      }
    },
  };
}

test('field edits preserve history grouping, normalize schedules and suppress unchanged writes', () => {
  const { state, add, actions, port } = fixture();
  const task = add({
    date: '2026-10-20',
    time: '14:30',
    repeat: { frequency: 'monthly', interval: 1, anchorDay: 20 },
  });
  expect(actions.update(task.id, { title: task.title }).status).toBe('unchanged');
  expect(port.apply).not.toHaveBeenCalled();

  expect(actions.update(task.id, { date: '2026-11-12' }).status).toBe('applied');
  expect(state.data.tasks[0].repeat?.anchorDay).toBe(12);
  expect(port.apply).toHaveBeenCalledExactlyOnceWith(
    {
      type: 'task.update',
      id: task.id,
      patch: { date: '2026-11-12', repeat: { frequency: 'monthly', interval: 1, anchorDay: 12 } },
    },
    `task:${task.id}:date`,
  );

  actions.update(task.id, { date: null });
  expect([
    state.data.tasks[0].date,
    state.data.tasks[0].time,
    state.data.tasks[0].repeat,
  ]).toStrictEqual([null, null, null]);
});

test('calendar preserves time on a date-only move; all-day and undated have distinct effects', () => {
  const { state, add, actions } = fixture();
  const task = add({
    date: '2026-10-20',
    time: '14:30',
    repeat: { frequency: 'weekly', interval: 1 },
  });
  actions.schedule(task.id, { date: '2026-10-21' });
  expect(state.data.tasks[0].time).toBe('14:30');

  actions.schedule(task.id, { date: '2026-10-21', time: null });
  expect(state.data.tasks[0].time).toBeNull();
  expect(state.data.tasks[0].repeat).not.toBeNull();
  expect(actions.schedule(task.id, { date: '2026-10-21', time: null }).status).toBe('unchanged');

  actions.schedule(task.id, { date: null });
  expect(state.data.tasks[0].repeat).toBeNull();
});

test('detail date changes extend a repeat end while calendar moves retain their existing semantics', () => {
  const { state, add, actions } = fixture();
  const task = add({
    date: '2026-10-20',
    repeat: { frequency: 'monthly', interval: 1, until: '2026-11-20' },
  });
  actions.setDate(task.id, '2026-12-12');
  expect(state.data.tasks[0].repeat?.until).toBe('2026-12-12');
  expect(state.data.tasks[0].repeat?.anchorDay).toBe(12);
});

test('list moves detach an explicitly moved child, keep same-list children and use the latest snapshot', () => {
  const { state, add, actions, port } = fixture();
  state.data.lists.push({ id: 'work', name: 'work', color: '#123456' });
  const parent = add();
  const child = add({ parentId: parent.id });
  expect(actions.moveToList(child.id, 'inbox').status).toBe('unchanged');
  expect(state.data.tasks[1].parentId).toBe(parent.id);

  actions.moveToList(child.id, 'work');
  expect(state.data.tasks[1].parentId).toBeNull();
  expect(state.data.tasks[1].listId).toBe('work');

  state.data.tasks[1].completedAt = '2026-10-20T00:00:00Z';
  actions.toggle(child.id);
  expect(port.completeTask).toHaveBeenCalledExactlyOnceWith(child.id, false);
});

test('matrix urgency includes tomorrow and retains dates and priority within their destination class', () => {
  const { state, add, actions } = fixture();
  state.data.matrixMode = 'complex';
  const today = dateKey();
  const task = add({ date: addDays(today, 1), priority: 3 });
  expect(actions.moveToQuadrant(task.id, 'do').status).toBe('unchanged');

  actions.moveToQuadrant(task.id, 'plan');
  expect(state.data.tasks[0].date).toBe(addDays(today, 2));
  expect(state.data.tasks[0].priority).toBe(3);

  expect(matrixTaskPatch(task, state.data.quadrants[3], 'complex', today)).toStrictEqual({
    priority: 1,
    date: addDays(today, 2),
  });
});

test('reorder preserves hidden tasks and pinned boundaries; exhausted floating-point gaps rebalance safely', () => {
  const { state, add } = fixture();
  const a = add({ order: 1 });
  const hidden = add({ order: 1 + Number.EPSILON });
  const b = add({ order: 2 });
  const pinned = add({ pinned: true, order: -1 });
  expect(reorderTask(state.data, a.id, pinned.id, 'before')).toBe(false);
  expect(reorderTask(state.data, b.id, hidden.id, 'before')).toBe(true);
  expect(
    [...state.data.tasks].sort((x, y) => x.order - y.order).map((task) => task.id),
  ).toStrictEqual([pinned.id, a.id, b.id, hidden.id]);
  expect(new Set(state.data.tasks.map((task) => task.order)).size).toBe(4);
  expect(reorderTask(state.data, b.id, hidden.id, 'before')).toBe(false);
});

test('capture keeps rejected lines, honors manual clearing and carries contextual tags and lists', () => {
  const draft = {
    text: 'Review #planning tomorrow\n#untitled',
    due: '',
    manualDate: true,
    priority: '2',
    time: '14:30',
    repeat: { frequency: 'daily' as const, interval: 1 },
  };
  const result = prepareTaskCapture(draft, { listId: 'work', tag: 'work' }, {}, '2026-10-20');
  expect(result.rejected).toStrictEqual(['#untitled']);
  expect(result.pending[0].options).toStrictEqual({
    listId: 'work',
    date: null,
    time: null,
    repeat: null,
    priority: 2,
    tags: ['planning', 'work'],
  });
});

test('subtask and quadrant creation keep inherited metadata, parsed priorities and creation order', () => {
  const { state, add, actions } = fixture();
  const parent = add({ listId: 'work' });
  add({ parentId: parent.id, order: 4 });
  const child = actions.createSubtask(parent.id, 'Subtask review');
  expect(child.status).toBe('applied');
  expect(state.data.tasks.at(-1)?.parentId).toStrictEqual(parent.id);
  expect(state.data.tasks.at(-1)?.listId).toBe('work');
  expect(state.data.tasks.at(-1)?.order).toBe(5);

  state.data.matrixMode = 'complex';
  actions.createInQuadrant('do', 'Matrix review !3');
  expect(state.data.tasks.at(-1)?.priority).toBe(1);
  expect(state.data.tasks.at(-1)?.date).toBe(dateKey());
});

test('stale and invalid requests are rejected before storage and never masquerade as success', () => {
  const { add, actions, commands } = fixture();
  const active = add();
  const trashed = add({ deleted: true });
  expect(actions.update('missing', { title: 'New title' })).toStrictEqual({
    status: 'failed',
    code: 'not_found',
  });
  expect(actions.update(active.id, { title: '  ' })).toStrictEqual({
    status: 'failed',
    code: 'invalid_entity',
  });
  expect(actions.toggle(trashed.id)).toStrictEqual({ status: 'failed', code: 'trashed' });
  expect(actions.purge([trashed.id, 'missing']).status).toBe('failed');
  expect(actions.create('#tagonly').status).toBe('failed');
  expect(actions.undo().status).toBe('unchanged');
  expect(actions.redo().status).toBe('unchanged');
  for (const command of commands) {
    expect(command).not.toHaveBeenCalled();
  }
});

test('all command paths return the same failure contract on synchronous port rejection', () => {
  const { state, add, actions, fail } = fixture();
  const task = add({ order: 0 });
  const trash = add({ deleted: true });
  const target = add({ order: 2 });
  state.data.lists.push({ id: 'work', name: 'work', color: '#123456' });
  state.canUndo = true;
  state.canRedo = true;
  const before = structuredClone(state.data);
  fail('storage_full');

  const operations = [
    () => actions.create('New task'),
    () => actions.createMany([{ input: 'First task' }, { input: 'Second task' }]),
    () => actions.update(task.id, { title: 'New title' }),
    () => actions.setTime(task.id, '09:30'),
    () => actions.setRepeat(task.id, { frequency: 'weekly', interval: 1 }),
    () => actions.toggle(task.id),
    () => actions.trash(task.id),
    () => actions.restore(trash.id),
    () => actions.purge([trash.id]),
    () => actions.duplicate(task.id, 'Duplicate'),
    () => actions.reorder(task.id, target.id, 'after'),
    () => actions.schedule(task.id, { date: '2026-10-21' }),
    () => actions.moveToList(task.id, 'work'),
    () => actions.moveToQuadrant(task.id, 'do'),
    () => actions.createSubtask(task.id, 'Child'),
    () => actions.createInQuadrant('do', 'New task'),
    () => actions.undo(),
    () => actions.redo(),
  ];

  for (const operation of operations) {
    expect(operation()).toStrictEqual({ status: 'failed', code: 'storage_full' });
  }

  expect(state.data).toStrictEqual(before);
});

test('time and repeat actions own the required date and clearing date removes both', () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-22T00:00:00Z'));
  try {
    const { add, actions, state } = fixture();
    const task = add();
    expect(actions.setTime(task.id, '09:30').status).toBe('applied');
    expect(state.data.tasks[0]).toMatchObject({ date: '2026-10-22', time: '09:30' });
    actions.setDate(task.id, null);
    expect(state.data.tasks[0]).toMatchObject({ date: null, time: null, repeat: null });
    actions.setRepeat(task.id, { frequency: 'weekly', interval: 1 });
    expect(state.data.tasks[0]).toMatchObject({
      date: '2026-10-22',
      repeat: { frequency: 'weekly', interval: 1 },
    });
  } finally {
    vi.useRealTimers();
  }
});
