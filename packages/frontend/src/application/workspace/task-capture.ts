import type { Task } from './model.ts';
import type { TaskCreation } from './task-actions.ts';
import { dateKey } from './dates.ts';
import { type QuickInputOptions, parseQuickInput } from './quick-input.ts';

export interface TaskCaptureDraft {
  text: string;
  due: string;
  manualDate: boolean;
  priority: string;
  time?: string | null;
  duration?: number;
  repeat?: Task['repeat'];
}

export interface TaskCaptureContext {
  listId?: string;
  date?: string;
  tag?: string;
  parentId?: string;
}

export function prepareTaskCapture(
  draft: TaskCaptureDraft,
  { listId, date, tag, parentId }: TaskCaptureContext,
  recognition: QuickInputOptions,
  today = dateKey(),
): { pending: TaskCreation[]; rejected: string[] } {
  const pending: { input: string; options: Partial<Task> }[] = [];
  const rejected: string[] = [];

  for (const line of draft.text.split('\n').filter((line) => line.trim())) {
    const parsedLine = parseQuickInput(line, today, recognition);
    const options: Partial<Task> = {};

    if (!parsedLine.listName && listId) {
      options.listId = listId;
    }

    if (draft.manualDate) {
      options.date = draft.due || null;
      if (!options.date) {
        options.time = null;
        options.repeat = null;
      }
    } else if (!parsedLine.date && date) {
      options.date = date;
    }

    if (draft.time !== undefined && options.date !== null) {
      options.time = draft.time;
      if (options.time && !options.date && !parsedLine.date) {
        options.date = date ?? today;
      }
    }

    if (draft.duration !== undefined) {
      options.duration = draft.duration;
    }

    if (draft.repeat !== undefined && options.date !== null) {
      options.repeat = draft.repeat;
      if (options.repeat && !options.date && !parsedLine.date) {
        options.date = date ?? today;
      }

      const start = options.date ?? parsedLine.date;

      if (options.repeat?.until && start && options.repeat.until < start) {
        options.repeat = { ...options.repeat, until: start };
      }
    }

    if (draft.priority !== '') {
      options.priority = Number(draft.priority) as Task['priority'];
    }

    if (parentId) {
      options.parentId = parentId;
    }

    if (tag) {
      options.tags = [...new Set([...parsedLine.tags, tag])];
    }

    if (parsedLine.title) {
      pending.push({ input: line, options });
    } else {
      rejected.push(line);
    }
  }

  return { pending, rejected };
}
