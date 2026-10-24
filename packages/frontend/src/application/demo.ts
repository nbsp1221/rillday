import {
  type Workspace,
  checkInId,
  createWorkspace,
  recordQuantity,
  validateWorkspace,
} from '@repo/domain';
import { createDomainContext, deviceZone } from './context.ts';
import { applyWorkspaceIntent } from './workspace/apply-intent.ts';
import {
  type Habit,
  type Task,
  addDays,
  createTaskRecord,
  dateKey,
  emptyWorkspace,
} from './workspace/index.ts';

/** Sample data never replaces an existing workspace. */
export function createDemoWorkspace(today = dateKey()): Workspace {
  const data = emptyWorkspace();
  data.lists.push(
    { id: 'work', name: 'Work and projects', color: '#7d9cc4' },
    { id: 'life', name: 'Everyday life', color: '#94b781' },
    { id: 'reading', name: 'Reading list', color: '#c591ba' },
  );
  let order = 0;

  const task = (title: string, options: Partial<Task> = {}) => {
    const item = createTaskRecord(title, data, { order: order++, ...options })!;
    data.tasks.push(item);
    return item;
  };

  const planning = task('Choose three priorities for the coming week', {
    date: today,
    priority: 3,
    pinned: true,
    tags: ['planning', 'personal'],
    notes:
      'Choose three outcomes you can finish this week.\n\nStart small and make time for what matters.\n\n- [x] Review current projects\n- [ ] Choose three important outcomes\n- [ ] Schedule focused work',
  });
  task('Collect links to read', { parentId: planning.id, tags: ['research'] });
  task('Organize notes on one page', { parentId: planning.id });
  task('Review the weekend shopping list', {
    priority: 1,
    tags: ['life'],
    notes: '- [ ] Milk and eggs\n- [x] Fruit and vegetables',
  });
  task('Write down a new idea', {
    notes: 'A date can wait. Organize this later with lists and labels.',
    tags: ['ideas'],
  });
  task('Check photo backups', { priority: 0, tags: ['organizing'] });
  task('Review the weekly plan and choose one small next step', {
    priority: 2,
    tags: ['review'],
    date: addDays(today, 2),
  });
  task('Finish one small overdue task', { date: addDays(today, -2), priority: 3 });
  task('Make a walking playlist', { priority: 0 });
  task('Check in with a friend', { date: addDays(today, 1), priority: 1 });
  task(
    'Review references and long task titles for the new workspace before planning the next step',
    {
      priority: 2,
      tags: ['design', 'research'],
      notes: 'An example of a long title in the list and details panel.',
    },
  );
  const events = [
    ['Review the weekly plan', 0, '09:30', 60, 3],
    ['Design review', 0, '10:00', 90, 2],
    ['Project check-in', 0, '10:30', 45, 1],
    ['Afternoon focus', 0, '14:00', 90, 3],
    ['Refine the product plan', 1, '11:00', 60, 2],
    ['Turn feedback into tasks', 2, '15:00', 45, 1],
    ['Share weekly progress', 4, '16:00', 45, 2],
    ['Prioritize the next steps', 6, '10:00', 60, 2],
    ['Review completed work', -1, '17:00', 30, 1],
  ] as const;
  for (const [title, offset, time, duration, priority] of events) {
    task(title, {
      listId: 'work',
      date: addDays(today, offset),
      time,
      duration,
      priority,
      tags: ['work'],
    });
  }
  task('Read project research', {
    listId: 'work',
    priority: 2,
    date: addDays(today, 8),
    tags: ['research'],
  });
  task('Reduce distracting notifications', { listId: 'work', priority: 0 });
  task('Tidy the desk for 10 minutes', {
    listId: 'life',
    date: today,
    repeat: { frequency: 'daily', interval: 1 },
    priority: 1,
  });
  task('Stretch after a light workout', {
    listId: 'life',
    date: today,
    time: '18:30',
    duration: 30,
    priority: 2,
    tags: ['health'],
  });
  task('Find a new walking route', { listId: 'life', date: addDays(today, 3), priority: 0 });
  task('Review expenses and subscriptions', {
    listId: 'life',
    date: addDays(today, 7),
    priority: 2,
  });
  task('Save three memorable quotes', { listId: 'reading', priority: 0, tags: ['reading'] });
  task('Find recurring design patterns', {
    listId: 'reading',
    priority: 2,
    tags: ['design'],
  });
  task('How to keep a useful personal knowledge journal', { listId: 'reading', priority: 0 });
  task('Organize finished notes', { listId: 'life', completedAt: new Date().toISOString() });
  task('Weekly shopping', {
    listId: 'life',
    completedAt: new Date().toISOString(),
    date: addDays(today, -1),
  });
  task('An old draft to restore later', {
    deleted: true,
    notes: 'A sample task for trying trash and restore.',
  });
  const since = addDays(today, -28);

  const habit = (
    id: string,
    name: string,
    color: string,
    icon: string,
    options: Partial<Habit> = {},
  ): Habit => ({
    id,
    name,
    color,
    icon,
    kind: 'boolean',
    goal: 1,
    unit: 'times',
    frequency: 'daily',
    weekdays: [1, 2, 3, 4, 5],
    weeklyTarget: 4,
    reminderTime: null,
    archived: false,
    createdAt: `${since}T09:00:00.000Z`,
    startDate: since,
    step: 1,
    ...options,
  });

  data.habits = [
    habit('water', 'Drink enough water', '#7d9cc4', 'clover', {
      kind: 'quantity',
      goal: 8,
      unit: 'cups',
    }),
    habit('reading', 'Read a book', '#c591ba', 'star', {
      kind: 'quantity',
      goal: 20,
      unit: 'min',
      step: 5,
    }),
    habit('exercise', 'Light exercise', '#94b781', 'sun'),
    habit('journal', 'Write a daily journal', '#d2ae6a', 'diamond', { frequency: 'weekly' }),
    habit('words', 'Review new words', '#7eb4b4', '✦', { archived: true, frequency: 'weekdays' }),
  ];
  for (let offset = -27; offset <= 0; offset++) {
    const date = addDays(today, offset);
    for (const item of data.habits) {
      const completed = offset === 0 ? item.id === 'exercise' : (offset + item.id.length) % 6 !== 0;
      const value =
        offset === 0
          ? ({ water: 5, reading: 10, exercise: 1, journal: 0, words: 0 }[item.id] ?? 0)
          : completed
            ? item.goal
            : 0;
      data.habitLogs.push({
        habitId: item.id,
        date,
        value,
        skipped: item.id === 'water' && offset === -8,
        note: offset === -1 && item.id === 'journal' ? 'A day of steady progress.' : '',
      });
    }
  }
  const context = createDomainContext();
  const workspace = createWorkspace(context);
  const zone = deviceZone();
  const habitIds = new Map(data.habits.map((item) => [item.id, context.newId()]));
  const listIds = new Map(
    data.lists.map((list) => [list.id, list.id === 'inbox' ? 'inbox' : context.newId()]),
  );
  for (const list of data.lists.filter((item) => item.id !== 'inbox')) {
    applyWorkspaceIntent(
      workspace,
      { type: 'list.create', list: { ...list, id: listIds.get(list.id)! } },
      context,
      zone,
    );
  }
  const records = data.tasks.map((item) => ({ ...item, listId: listIds.get(item.listId)! }));
  applyWorkspaceIntent(workspace, { type: 'task.create', tasks: records }, context, zone);
  for (const item of records) {
    workspace.tasks[item.id].completedAt = item.completedAt;
    if (item.deleted) {
      workspace.tasks[item.id].trashedAt = context.now();
      workspace.tasks[item.id].trashGroup = context.newId();
    }
  }
  for (const item of data.habits) {
    applyWorkspaceIntent(
      workspace,
      { type: 'habit.save', habit: { ...item, id: habitIds.get(item.id)! }, weekStartsOn: 0 },
      context,
      zone,
    );
  }
  for (const { value, ...log } of data.habitLogs) {
    const habitId = habitIds.get(log.habitId)!;
    const habit = workspace.habits[habitId];
    const id = checkInId(habitId, log.date);
    workspace.checkIns[id] = {
      ...log,
      id,
      habitId,
      quantity: recordQuantity(value, context.newId()),
      goal: habit.rules[0].goal,
      unit: habit.rules[0].unit,
      ruleFrom: habit.rules[0].from,
    };
  }
  validateWorkspace(workspace);
  return workspace;
}
