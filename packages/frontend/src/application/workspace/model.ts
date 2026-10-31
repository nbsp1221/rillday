import {
  type HabitRule,
  type HabitTimeOfDay,
  type Priority,
  type QuadrantKey,
  createWorkspace,
} from '@repo/domain';
import { createDomainContext, deviceZone } from '../context.ts';
import { presentWorkspace } from './present-workspace.ts';

export type { Priority } from '@repo/domain';

export interface RepeatRule {
  frequency: 'daily' | 'weekly' | 'monthly' | 'weekdays';
  interval: number;
  until?: string;
  anchorDay?: number;
}

export interface Task {
  id: string;
  title: string;
  notes: string;
  listId: string;
  tags: string[];
  priority: Priority;
  date: string | null;
  time: string | null;
  duration: number;
  repeat: RepeatRule | null;
  reminderMinutes: number | null;
  parentId: string | null;
  notesFormat: 'markdown';
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  order: number;
  deleted: boolean;
  pinned: boolean;
  generatedFromId?: string;
  zone?: string | null;
}

export interface TaskList {
  id: string;
  name: string;
  color: string;
}

export interface Habit {
  id: string;
  name: string;
  color: string;
  icon: string;
  goal: number;
  unit: string;
  kind: 'boolean' | 'quantity';
  frequency: HabitRule['frequency'];
  timeOfDay?: HabitTimeOfDay;
  weekdays: number[];
  weeklyTarget: number;
  reminderTime: string | null;
  archived: boolean;
  createdAt: string;
  intervalDays?: number;
  step?: number;
  startDate?: string;
  zone?: string;
  rules?: HabitRule[];
}

export interface HabitLog {
  habitId: string;
  date: string;
  value: number;
  skipped: boolean;
  note: string;
  goal?: number;
  unit?: string;
  ruleFrom?: string;
}

export interface Quadrant {
  id: QuadrantKey;
  name: string | null;
  color: string;
  important: boolean;
  urgent: boolean;
}

export interface WorkspaceData {
  tasks: Task[];
  lists: TaskList[];
  habits: Habit[];
  habitLogs: HabitLog[];
  quadrants: Quadrant[];
  matrixMode?: 'simple' | 'complex';
  labels?: string[];
  labelColors?: Record<string, string>;
}

export interface WorkspaceProfile {
  id: string;
  name: string;
  color: string;
  server?: { url: string; email: string; role: 'user' | 'admin' };
}

export function emptyWorkspace(): WorkspaceData {
  return presentWorkspace(createWorkspace(createDomainContext()), deviceZone());
}
