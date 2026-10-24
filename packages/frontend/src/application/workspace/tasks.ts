import { classifyMatrixTask } from '@repo/domain';
import type { Task, WorkspaceData } from './model.ts';
import { dateKey } from './dates.ts';
import { type QuickInputOptions, parseQuickInput } from './quick-input.ts';

export function taskQuadrant(
  task: Task,
  today = dateKey(),
): { important: boolean; urgent: boolean } {
  return classifyMatrixTask(task, today);
}

export function createTaskRecord(
  input: string,
  data: WorkspaceData,
  options: Partial<Task> = {},
  recognition: QuickInputOptions = {},
): Task | null {
  const parsed = parseQuickInput(input, dateKey(), recognition);
  if (!parsed.title) {
    return null;
  }
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    title: parsed.title,
    notes: '',
    notesFormat: 'markdown',
    listId: data.lists.find((list) => list.name === parsed.listName)?.id ?? 'inbox',
    tags: parsed.tags,
    priority: parsed.priority,
    date: parsed.date,
    time: parsed.time,
    duration: 30,
    repeat: parsed.repeat,
    reminderMinutes: null,
    parentId: null,
    completedAt: null,
    createdAt: now,
    updatedAt: now,
    order: Date.now(),
    deleted: false,
    pinned: false,
    ...options,
  };
}
