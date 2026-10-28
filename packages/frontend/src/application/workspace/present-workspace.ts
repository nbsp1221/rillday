import {
  type Workspace,
  canonical,
  currentRule,
  displaySchedule,
  quantityValue,
} from '@repo/domain';
import { todayIn } from '../context.ts';
import type { Task, WorkspaceData } from './model.ts';

const compare = (left: string, right: string) => (left < right ? -1 : left > right ? 1 : 0);

const compareRank = (left: { rank: string; id: string }, right: { rank: string; id: string }) =>
  compare(left.rank, right.rank) || compare(left.id, right.id);

export function presentWorkspace(
  workspace: Workspace,
  zone: string,
  previous?: WorkspaceData,
): WorkspaceData {
  const inbox = Object.values(workspace.lists).find((list) => list.system === 'inbox');
  const previousTasks = new Map(previous?.tasks.map((task) => [task.id, task]));
  const tasks = Object.values(workspace.tasks)
    .filter((task) => !task.purgedAt && !task.voided)
    .sort(compareRank)
    .map((record, order) => {
      const visible = displaySchedule(record.schedule, zone);
      const task: Task = {
        id: record.id,
        title: record.title,
        notes: record.notes,
        notesFormat: 'markdown',
        listId: record.location.listId === inbox?.id ? 'inbox' : record.location.listId,
        parentId: record.location.parentId,
        tags: record.labelIds.flatMap((id) => workspace.labels[id]?.name ?? []),
        priority: record.priority,
        date: visible.date,
        time: visible.time,
        zone: record.schedule.zone,
        duration: record.schedule.durationMinutes,
        repeat: record.schedule.repeat
          ? {
              ...record.schedule.repeat,
              until: visible.repeat?.until ?? undefined,
              anchorDay: record.schedule.repeat.anchorDay ?? undefined,
            }
          : null,
        reminderMinutes: record.schedule.reminderMinutes,
        completedAt: record.completedAt,
        createdAt: record.createdAt,
        updatedAt: record.updatedAt,
        order,
        deleted: Boolean(record.trashedAt),
        pinned: record.pinned,
        ...(record.generatedFromId ? { generatedFromId: record.generatedFromId } : {}),
      };
      const cached = previousTasks.get(record.id);
      return cached && canonical(cached) === canonical(task) ? cached : task;
    });

  return {
    tasks,
    lists: Object.values(workspace.lists)
      .sort(compareRank)
      .map((list) => ({
        id: list.system === 'inbox' ? 'inbox' : list.id,
        name: list.system === 'inbox' ? 'Inbox' : list.name,
        color: list.color,
      })),
    labels: Object.values(workspace.labels).map((label) => label.name),
    labelColors: Object.fromEntries(
      Object.values(workspace.labels)
        .filter((label) => label.color)
        .map((label) => [label.name, label.color!]),
    ),
    habits: Object.values(workspace.habits)
      .sort(compareRank)
      .map((habit) => ({
        id: habit.id,
        name: habit.name,
        color: habit.color,
        icon: habit.icon,
        ...(habit.timeOfDay ? { timeOfDay: habit.timeOfDay } : {}),
        archived: habit.archived,
        startDate: habit.startDate,
        createdAt: habit.createdAt,
        reminderTime: habit.reminderTime,
        zone: habit.zone,
        rules: habit.rules,
        ...currentRule(habit, todayIn(habit.zone)),
      })),
    habitLogs: Object.values(workspace.checkIns).map(({ id: _id, quantity, ...log }) => ({
      ...log,
      value: quantityValue(quantity),
    })),
    quadrants: Object.values(workspace.quadrants)
      .sort(compareRank)
      .map((quadrant) => ({
        id: quadrant.key,
        name: quadrant.name,
        color: quadrant.color,
        important: quadrant.important,
        urgent: quadrant.urgent,
      })),
    matrixMode: workspace.matrixMode,
  };
}
