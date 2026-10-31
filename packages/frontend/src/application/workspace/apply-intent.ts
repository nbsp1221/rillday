import {
  type DomainContext,
  type HabitRule,
  type Schedule,
  type Workspace,
  canonical,
  createHabit,
  createLabel,
  createList,
  createTask,
  editHabit,
  editList,
  editTask,
  removeHabit,
  reviseHabitRules,
  setTaskRank,
  taskData,
} from '@repo/domain';
import { generateKeyBetween, generateNKeysBetween } from 'fractional-indexing';
import { Temporal } from 'temporal-polyfill/implementation';
import type { WorkspaceIntent } from '../workspace-intents.ts';
import { todayIn } from '../context.ts';
import type { Habit, Task } from './model.ts';
import { presentWorkspace } from './present-workspace.ts';
import { normalizeTaskPatch, reorderTask } from './task-policies.ts';

const same = (left: unknown, right: unknown) => canonical(left) === canonical(right);

function appendRank(records: { rank: string }[]) {
  const last = records
    .map((record) => record.rank)
    .sort()
    .at(-1);
  return generateKeyBetween(last ?? null, null);
}

function taskSchedule(
  task: Task,
  previous: Task | undefined,
  stored: Schedule | undefined,
  zone: string,
): Schedule {
  const timingChanged =
    !previous ||
    (['date', 'time', 'zone', 'repeat'] as const).some(
      (field) => !same(task[field], previous[field]),
    );
  if (!timingChanged && stored) {
    return { ...stored, durationMinutes: task.duration, reminderMinutes: task.reminderMinutes };
  }
  return {
    date: task.date,
    time: task.time,
    zone: task.time ? ((previous && task.zone !== previous.zone ? task.zone : zone) ?? zone) : null,
    durationMinutes: task.duration,
    repeat: task.repeat
      ? {
          ...task.repeat,
          until: task.repeat.until ?? null,
          anchorDay:
            task.repeat.frequency === 'monthly' && task.date
              ? Temporal.PlainDate.from(task.date).day
              : (task.repeat.anchorDay ?? null),
        }
      : null,
    reminderMinutes: task.reminderMinutes,
  };
}

function writeTasks(workspace: Workspace, records: Task[], context: DomainContext, zone: string) {
  const view = presentWorkspace(workspace, zone);
  const inbox = Object.values(workspace.lists).find((list) => list.system === 'inbox');
  if (!inbox) {
    throw new Error('missing_inbox');
  }
  const supplied = new Set(records.map((task) => task.id));
  const ordered = [...view.tasks.filter((task) => !supplied.has(task.id)), ...records].sort(
    (left, right) => left.order - right.order || left.id.localeCompare(right.id),
  );
  const ranks = new Map(Object.values(workspace.tasks).map((task) => [task.id, task.rank]));
  const moving = new Set(
    records
      .filter((task) => {
        const previous = view.tasks.find((candidate) => candidate.id === task.id);
        return !ranks.has(task.id) || (previous && previous.order !== task.order);
      })
      .map((task) => task.id),
  );
  for (let index = 0; index < ordered.length; index++) {
    if (!moving.has(ordered[index].id)) {
      continue;
    }
    const start = index;
    const left = ranks.get(ordered[start - 1]?.id) ?? null;
    while (
      index + 1 < ordered.length &&
      (moving.has(ordered[index + 1].id) ||
        (left !== null && (ranks.get(ordered[index + 1].id) ?? left) <= left))
    ) {
      index++;
    }
    const right = ranks.get(ordered[index + 1]?.id) ?? null;
    const keys = generateNKeysBetween(left, right, index - start + 1);
    keys.forEach((rank, offset) => ranks.set(ordered[start + offset].id, rank));
  }
  for (const task of ordered) {
    const rank = ranks.get(task.id);
    if (!supplied.has(task.id) && rank && workspace.tasks[task.id].rank !== rank) {
      setTaskRank(workspace, task.id, rank, context);
    }
  }
  for (const task of records) {
    const stored = workspace.tasks[task.id];
    const previous = view.tasks.find((candidate) => candidate.id === task.id);
    const rank = ranks.get(task.id)!;
    const labelIds = task.tags.map((name) => {
      let label = Object.values(workspace.labels).find((candidate) => candidate.name === name);
      if (!label) {
        const id = context.newId();
        createLabel(workspace, id, { name, color: view.labelColors?.[name] ?? null });
        label = workspace.labels[id];
      }
      return label.id;
    });
    const listId = task.listId === 'inbox' ? inbox.id : task.listId;
    const data = taskData(listId, task.title, {
      notes: task.notes,
      location: { listId, parentId: task.parentId },
      labelIds,
      priority: task.priority,
      schedule: taskSchedule(task, previous, stored?.schedule, zone),
      rank,
      pinned: task.pinned,
    });
    if (!stored) {
      createTask(workspace, task.id, data, context);
    } else {
      const {
        completedAt: _completed,
        generatedFromId: _source,
        voided: _voided,
        ...editable
      } = data;
      editTask(workspace, task.id, editable, context);
    }
  }
}

function saveHabit(
  workspace: Workspace,
  habit: Habit,
  weekStartsOn: 0 | 1,
  context: DomainContext,
  zone: string,
) {
  const previous = workspace.habits[habit.id];
  const accountingZone = habit.zone ?? previous?.zone ?? zone;
  const today = todayIn(accountingZone, context.now());
  const rule: HabitRule = {
    from: habit.startDate ?? today,
    kind: habit.kind,
    goal: habit.goal,
    unit: habit.unit,
    step: habit.step ?? 1,
    frequency: habit.frequency,
    weekdays: habit.weekdays,
    weeklyTarget: habit.weeklyTarget,
    intervalDays: habit.intervalDays ?? 1,
  };
  const rules = previous ? reviseHabitRules(previous, rule, today, weekStartsOn) : [rule];
  const data = {
    name: habit.name,
    color: habit.color,
    icon: habit.icon,
    ...(habit.timeOfDay ? { timeOfDay: habit.timeOfDay } : {}),
    archived: habit.archived,
    startDate: habit.startDate ?? rules[0].from,
    reminderTime: habit.reminderTime,
    zone: accountingZone,
    rank: previous?.rank ?? appendRank(Object.values(workspace.habits)),
    rules,
  };
  if (previous) {
    editHabit(workspace, habit.id, data, weekStartsOn, context);
  } else {
    createHabit(workspace, habit.id, data, context);
  }
}

export function applyWorkspaceIntent(
  workspace: Workspace,
  intent: WorkspaceIntent,
  context: DomainContext,
  zone: string,
) {
  switch (intent.type) {
    case 'task.create': {
      if (intent.tasks.some((task) => workspace.tasks[task.id])) {
        throw new Error('already_exists');
      }
      writeTasks(workspace, intent.tasks, context, zone);
      return;
    }
    case 'task.update': {
      const previous = presentWorkspace(workspace, zone).tasks.find(
        (task) => task.id === intent.id,
      );
      if (!previous) {
        throw new Error('not_found');
      }
      writeTasks(
        workspace,
        [{ ...previous, ...normalizeTaskPatch(previous, intent.patch) }],
        context,
        zone,
      );
      return;
    }
    case 'task.reorder': {
      const view = presentWorkspace(workspace, zone);
      const orders = new Map(view.tasks.map((task) => [task.id, task.order]));
      if (reorderTask(view, intent.from, intent.to, intent.placement)) {
        writeTasks(
          workspace,
          view.tasks.filter((task) => task.order !== orders.get(task.id)),
          context,
          zone,
        );
      }
      return;
    }
    case 'list.create':
      createList(workspace, intent.list.id, {
        name: intent.list.name,
        color: intent.list.color,
        system: null,
        rank: appendRank(Object.values(workspace.lists)),
      });
      return;
    case 'list.update':
      editList(workspace, intent.list.id, { name: intent.list.name, color: intent.list.color });
      return;
    case 'label.create':
      if (Object.values(workspace.labels).some((label) => label.name === intent.name)) {
        throw new Error('duplicate_label');
      }
      createLabel(workspace, context.newId(), { name: intent.name, color: intent.color ?? null });
      return;
    case 'habit.save':
      saveHabit(workspace, intent.habit, intent.weekStartsOn, context, zone);
      return;
    case 'habit.archive': {
      const habit = workspace.habits[intent.id];
      if (!habit) {
        throw new Error('not_found');
      }
      const { id: _id, createdAt: _created, ...data } = habit;
      editHabit(workspace, intent.id, { ...data, archived: intent.archived }, 0, context);
      return;
    }
    case 'habit.remove':
      removeHabit(workspace, intent.id);
      return;
    case 'quadrant.update': {
      const quadrant = Object.values(workspace.quadrants).find(
        (candidate) => candidate.key === intent.id,
      );
      if (!quadrant) {
        throw new Error('not_found');
      }
      Object.assign(quadrant, intent.patch);
      return;
    }
    case 'matrix.mode':
      workspace.matrixMode = intent.mode;
  }
}
