import { z } from 'zod';

export const productAreas = ['tasks', 'matrix', 'calendar', 'habits'] as const;

export type ProductArea = (typeof productAreas)[number];

export const taskSorts = [
  'manual',
  'date',
  'date-desc',
  'priority',
  'priority-asc',
  'title',
  'title-desc',
] as const;
export const taskGroups = ['none', 'date', 'list', 'priority'] as const;
export const calendarViews = ['day', 'week', 'month', 'year', 'agenda'] as const;

export type CalendarViewMode = (typeof calendarViews)[number];

export type TaskViewOptions = {
  sort: (typeof taskSorts)[number];
  group: (typeof taskGroups)[number];
};

export interface AppPreferences {
  language: 'ko' | 'en';
  theme: 'light' | 'dark' | 'system';
  startupView: ProductArea;
  density: 'comfortable' | 'compact';
  weekStartsOn: 0 | 1;
  timeFormat: '12h' | '24h';
  showCompleted: boolean;
  recognizeDates: boolean;
  removeDateText: boolean;
  keepTagText: boolean;
  calendarView: CalendarViewMode;
  calendarShowCompleted: boolean;
  taskViews: Record<string, TaskViewOptions>;
}

export const defaultPreferences: AppPreferences = {
  language: 'en',
  theme: 'dark',
  startupView: 'tasks',
  density: 'comfortable',
  weekStartsOn: 0,
  timeFormat: '24h',
  showCompleted: false,
  recognizeDates: true,
  removeDateText: true,
  keepTagText: false,
  calendarView: 'month',
  calendarShowCompleted: false,
  taskViews: {},
};

const preferenceSchema = z
  .object({
    language: z.enum(['ko', 'en']).catch(defaultPreferences.language),
    theme: z.enum(['light', 'dark', 'system']).catch(defaultPreferences.theme),
    startupView: z.enum(productAreas).catch(defaultPreferences.startupView),
    density: z.enum(['comfortable', 'compact']).catch(defaultPreferences.density),
    weekStartsOn: z.union([z.literal(0), z.literal(1)]).catch(defaultPreferences.weekStartsOn),
    timeFormat: z.enum(['12h', '24h']).catch(defaultPreferences.timeFormat),
    showCompleted: z.boolean().catch(defaultPreferences.showCompleted),
    recognizeDates: z.boolean().catch(defaultPreferences.recognizeDates),
    removeDateText: z.boolean().catch(defaultPreferences.removeDateText),
    keepTagText: z.boolean().catch(defaultPreferences.keepTagText),
    calendarView: z.enum(calendarViews).catch(defaultPreferences.calendarView),
    calendarShowCompleted: z.boolean().catch(defaultPreferences.calendarShowCompleted),
    taskViews: z.record(z.string(), z.unknown()).catch({}),
  })
  .catch({ ...defaultPreferences, taskViews: {} });

const taskViewSchema = z.object({ sort: z.enum(taskSorts), group: z.enum(taskGroups) });

// Invalid fields fall back independently, preserving other saved preferences.
export function normalizePreferences(value: unknown): AppPreferences {
  const saved = preferenceSchema.parse(value);
  const taskViews: AppPreferences['taskViews'] = {};
  for (const [scope, options] of Object.entries(saved.taskViews)) {
    if (
      !['today', 'next', 'all', 'completed', 'trash'].includes(scope) &&
      !scope.startsWith('list:') &&
      !scope.startsWith('tag:')
    ) {
      continue;
    }
    const parsed = taskViewSchema.safeParse(options);
    if (parsed.success) {
      taskViews[scope] = parsed.data;
    }
  }
  return { ...saved, taskViews };
}
