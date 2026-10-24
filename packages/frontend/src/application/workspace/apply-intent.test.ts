import {
  type DomainContext,
  createTask,
  createWorkspace,
  scheduleInstant,
  taskData,
  trashTask,
  validateWorkspace,
} from '@repo/domain';
import { produce } from 'immer';
import { afterEach, expect, test, vi } from 'vitest';
import type { WorkspaceIntent } from '../workspace-intents.ts';
import { applyWorkspaceIntent } from './apply-intent.ts';
import { createHabitDraft } from './habits.ts';
import { presentWorkspace } from './present-workspace.ts';
import { createTaskRecord } from './tasks.ts';

const context: DomainContext = {
  now: () => '2026-10-20T03:00:00.000Z',
  newId: () => crypto.randomUUID(),
};

afterEach(() => vi.useRealTimers());

function fixture(zone = 'Asia/Seoul') {
  let workspace = createWorkspace(context);

  const read = () => workspace;
  const view = () => presentWorkspace(workspace, zone);

  const apply = (intent: WorkspaceIntent) => {
    workspace = produce(workspace, (draft) => {
      applyWorkspaceIntent(draft, intent, context, zone);
      validateWorkspace(draft);
    });
  };

  return { read, view, apply };
}

test('task creation resolves UI list and label names; editing preserves unrelated records and read-model identity', () => {
  const { read, view, apply } = fixture();
  const first = createTaskRecord('First', view())!;
  const second = createTaskRecord('Second', view())!;
  first.tags = ['Planning'];
  first.order = 0;
  second.order = 1;
  apply({ type: 'task.create', tasks: [first, second] });
  const before = view();
  const originalSecond = read().tasks[second.id];
  expect(before.tasks[0].tags).toEqual(['Planning']);
  expect(read().lists[read().tasks[first.id].location.listId].system).toBe('inbox');
  apply({ type: 'task.update', id: first.id, patch: { title: 'Edited' } });
  const after = presentWorkspace(read(), 'Asia/Seoul', before);
  expect(after.tasks[0].title).toBe('Edited');
  expect(after.tasks[0]).not.toBe(before.tasks[0]);
  expect(after.tasks[1]).toBe(before.tasks[1]);
  expect(read().tasks[second.id]).toBe(originalSecond);
  const unchanged = read();
  expect(() => apply({ type: 'task.update', id: first.id, patch: { title: '' } })).toThrow();
  expect(read()).toBe(unchanged);
});

test('new lists and habits append in creation order and editing preserves their position', () => {
  const { view, apply } = fixture();
  const ids = [context.newId(), context.newId()].sort().reverse();
  for (const [index, id] of ids.entries()) {
    apply({ type: 'list.create', list: { id, name: `List ${index}`, color: '#7d9cc4' } });
    apply({
      type: 'habit.save',
      habit: { ...createHabitDraft('times'), id, name: `Habit ${index}` },
      weekStartsOn: 0,
    });
  }
  expect(view().lists.map((list) => list.name)).toEqual(['Inbox', 'List 0', 'List 1']);
  expect(view().habits.map((habit) => habit.name)).toEqual(['Habit 0', 'Habit 1']);
  apply({ type: 'list.update', list: { ...view().lists[1], name: 'Edited list' } });
  apply({
    type: 'habit.save',
    habit: { ...view().habits[0], name: 'Edited habit' },
    weekStartsOn: 0,
  });
  expect(view().lists.map((list) => list.id)).toEqual(['inbox', ...ids]);
  expect(view().habits.map((habit) => habit.id)).toEqual(ids);
});

test('task ordering follows rank code points, including upper and lower case ranks', () => {
  const workspace = createWorkspace(context);
  const listId = Object.keys(workspace.lists)[0];
  const last = createTask(
    workspace,
    context.newId(),
    taskData(listId, 'Last', { rank: 'a0' }),
    context,
  );
  const first = createTask(
    workspace,
    context.newId(),
    taskData(listId, 'First', { rank: 'Zz' }),
    context,
  );
  expect(presentWorkspace(workspace, 'UTC').tasks.map((task) => task.id)).toEqual([
    first.id,
    last.id,
  ]);
});

test('reordering reaches both ends without changing completion or task content', () => {
  const { read, view, apply } = fixture();
  const tasks = ['First', 'Second', 'Third'].map((title, order) => ({
    ...createTaskRecord(title, view())!,
    order,
  }));
  apply({ type: 'task.create', tasks });
  apply({ type: 'task.reorder', from: tasks[0].id, to: tasks[2].id, placement: 'after' });
  expect(view().tasks.map((task) => task.title)).toEqual(['Second', 'Third', 'First']);
  apply({ type: 'task.reorder', from: tasks[0].id, to: tasks[1].id, placement: 'before' });
  expect(view().tasks.map((task) => task.title)).toEqual(['First', 'Second', 'Third']);
  expect(Object.values(read().tasks).every((task) => task.completedAt === null)).toBe(true);
});

test('batch capture before existing tasks allocates the complete run in requested order', () => {
  const { view, apply } = fixture();
  apply({ type: 'task.create', tasks: [createTaskRecord('Existing', view())!] });
  const tasks = ['New first', 'New second'].map((title, index) =>
    createTaskRecord(title, view(), { order: -2 + index })!,
  );
  apply({ type: 'task.create', tasks });
  expect(view().tasks.map((task) => task.title)).toEqual(['New first', 'New second', 'Existing']);
});

test('reordering between concurrent equal ranks reranks colliding neighbors too', () => {
  const workspace = createWorkspace(context);
  const listId = Object.keys(workspace.lists)[0];
  const firstId = '00000000-0000-4000-8000-000000000001';
  const secondId = '00000000-0000-4000-8000-000000000002';
  const thirdId = '00000000-0000-4000-8000-000000000003';
  createTask(workspace, firstId, taskData(listId, 'First', { rank: 'a0' }), context);
  createTask(workspace, secondId, taskData(listId, 'Second', { rank: 'a0' }), context);
  createTask(workspace, thirdId, taskData(listId, 'Third', { rank: 'a1' }), context);
  applyWorkspaceIntent(
    workspace,
    { type: 'task.reorder', from: thirdId, to: secondId, placement: 'before' },
    context,
    'UTC',
  );
  expect(presentWorkspace(workspace, 'UTC').tasks.map((task) => task.title)).toEqual([
    'First',
    'Third',
    'Second',
  ]);
});

test('rank maintenance may include a trashed neighbor without editing its content or restoring it', () => {
  const workspace = createWorkspace(context);
  const listId = Object.keys(workspace.lists)[0];
  const firstId = '00000000-0000-4000-8000-000000000001';
  const secondId = '00000000-0000-4000-8000-000000000002';
  createTask(workspace, firstId, taskData(listId, 'First', { rank: 'a0' }), context);
  createTask(workspace, secondId, taskData(listId, 'Trashed', { rank: 'a0' }), context);
  trashTask(workspace, secondId, context);
  const view = presentWorkspace(workspace, 'UTC');
  const task = createTaskRecord('Inserted', view, { order: 0.5 })!;
  applyWorkspaceIntent(workspace, { type: 'task.create', tasks: [task] }, context, 'UTC');
  expect(presentWorkspace(workspace, 'UTC').tasks.map((candidate) => candidate.title)).toEqual([
    'First',
    'Inserted',
    'Trashed',
  ]);
  expect(workspace.tasks[secondId].trashedAt).toBe(context.now());
  expect(() => validateWorkspace(workspace)).not.toThrow();
});

test('editing text in another timezone does not reinterpret a timed schedule', () => {
  const workspace = createWorkspace(context);
  const listId = Object.keys(workspace.lists)[0];
  const task = createTask(
    workspace,
    context.newId(),
    taskData(listId, 'Timed', {
      schedule: {
        date: '2026-10-20',
        time: '09:00',
        zone: 'Asia/Seoul',
        durationMinutes: 30,
        repeat: null,
        reminderMinutes: null,
      },
    }),
    context,
  );
  const after = produce(workspace, (draft) =>
    applyWorkspaceIntent(
      draft,
      {
        type: 'task.update',
        id: task.id,
        patch: { title: 'Keep the same instant', duration: 60 },
      },
      context,
      'America/New_York',
    ),
  );
  expect(after.tasks[task.id].schedule).toEqual({ ...task.schedule, durationMinutes: 60 });
  expect(presentWorkspace(after, 'America/New_York').tasks[0]).toMatchObject({
    date: '2026-10-19',
    time: '20:00',
  });
  const rescheduled = produce(after, (draft) =>
    applyWorkspaceIntent(
      draft,
      { type: 'task.update', id: task.id, patch: { time: '21:00' } },
      context,
      'America/New_York',
    ),
  );
  expect(rescheduled.tasks[task.id].schedule.zone).toBe('America/New_York');
  expect(scheduleInstant(rescheduled.tasks[task.id].schedule)).toBe('2026-10-20T01:00:00Z');
  const allDay = produce(after, (draft) =>
    applyWorkspaceIntent(
      draft,
      { type: 'task.update', id: task.id, patch: { time: null, date: '2026-10-20' } },
      context,
      'Asia/Seoul',
    ),
  );
  expect(presentWorkspace(allDay, 'America/New_York').tasks[0]).toMatchObject({
    date: '2026-10-20',
    time: null,
  });
});

test.each([
  { zone: 'Asia/Seoul', date: '2026-10-20' },
  { zone: 'America/New_York', date: '2026-10-19' },
])('habit creation uses its accounting day in $zone', ({ zone, date }) => {
  const workspace = createWorkspace(context);
  applyWorkspaceIntent(
    workspace,
    {
      type: 'habit.save',
      weekStartsOn: 0,
      habit: {
        id: context.newId(),
        name: 'Accounting day',
        zone,
        color: '#7d9cc4',
        icon: 'circle',
        kind: 'boolean',
        goal: 1,
        unit: 'times',
        frequency: 'daily',
        weekdays: [],
        weeklyTarget: 3,
        reminderTime: null,
        archived: false,
        createdAt: '2026-10-19T22:30:00.000Z',
      },
    },
    { ...context, now: () => '2026-10-19T22:30:00.000Z' },
    'Pacific/Apia',
  );
  expect(Object.values(workspace.habits)[0]).toMatchObject({
    startDate: date,
    rules: [{ from: date }],
  });
});

test.each([
  { weekStartsOn: 0 as const, effective: '2026-10-25' },
  { weekStartsOn: 1 as const, effective: '2026-10-26' },
])(
  'weekly goal edits retain history and begin at boundary $weekStartsOn',
  ({ weekStartsOn, effective }) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(context.now()));
    const { read, view, apply } = fixture();
    const habit = {
      id: context.newId(),
      name: 'Weekly goal',
      color: '#7d9cc4',
      icon: 'circle',
      kind: 'boolean' as const,
      goal: 1,
      unit: 'times',
      frequency: 'weekly' as const,
      weekdays: [],
      weeklyTarget: 2,
      reminderTime: null,
      archived: false,
      createdAt: '2026-10-12T00:00:00.000Z',
      startDate: '2026-10-12',
      zone: 'Asia/Seoul',
    };
    apply({ type: 'habit.save', habit, weekStartsOn });
    apply({ type: 'habit.save', habit: { ...view().habits[0], weeklyTarget: 3 }, weekStartsOn });
    expect(read().habits[habit.id].rules).toMatchObject([
      { from: '2026-10-12', weeklyTarget: 2 },
      { from: effective, weeklyTarget: 3 },
    ]);
  },
);
