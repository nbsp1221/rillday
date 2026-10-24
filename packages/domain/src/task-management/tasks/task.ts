import { z } from 'zod';
import type { DomainContext } from '../../shared-kernel/clock.ts';
import { Fault } from '../../shared-kernel/fault.ts';
import { rank, uuid } from '../../shared-kernel/values.ts';
import { scheduleSchema } from '../scheduling/schedule.ts';

export const taskSchema = z.strictObject({
  title: z.string().trim().min(1).max(100000),
  notes: z.string().max(1048576),
  notesFormat: z.literal('markdown'),
  location: z.strictObject({ listId: uuid, parentId: uuid.nullable() }),
  labelIds: z
    .array(uuid)
    .max(100)
    .refine((v) => new Set(v).size === v.length),
  priority: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
  schedule: scheduleSchema,
  completedAt: z.iso.datetime().nullable(),
  rank,
  pinned: z.boolean(),
  generatedFromId: uuid.nullable(),
  voided: z.boolean().default(false),
});

export type TaskInput = z.input<typeof taskSchema>;
export type TaskData = z.output<typeof taskSchema>;
export type Priority = TaskData['priority'];

export interface Task extends TaskData {
  id: string;
  createdAt: string;
  updatedAt: string;
  trashedAt: string | null;
  purgedAt: string | null;
  generatedDigest: string | null;
  trashGroup: string | null;
}

export function validateTaskData(input: unknown): TaskData {
  const parsed = taskSchema.safeParse(input);
  if (!parsed.success) {
    throw new Fault('invalid_task');
  }
  return parsed.data;
}

export function instantiateTask(id: string, data: TaskData, context: DomainContext): Task {
  const now = context.now();
  return {
    ...data,
    id,
    createdAt: now,
    updatedAt: now,
    trashedAt: null,
    purgedAt: null,
    generatedDigest: null,
    trashGroup: null,
  };
}

export function taskProperties(task: Task): TaskData {
  const {
    id: _id,
    createdAt: _createdAt,
    updatedAt: _updatedAt,
    trashedAt: _trashedAt,
    purgedAt: _purgedAt,
    generatedDigest: _generatedDigest,
    trashGroup: _trashGroup,
    ...properties
  } = task;
  return properties;
}

export function taskData(
  listId: string,
  title = 'Task',
  extra: Partial<TaskInput> = {},
): TaskInput {
  return {
    title,
    notes: '',
    notesFormat: 'markdown',
    location: { listId, parentId: null },
    labelIds: [],
    priority: 0,
    schedule: {
      date: null,
      time: null,
      zone: null,
      durationMinutes: 30,
      repeat: null,
      reminderMinutes: null,
    },
    completedAt: null,
    rank: 'a0',
    pinned: false,
    generatedFromId: null,
    voided: false,
    ...extra,
  };
}
