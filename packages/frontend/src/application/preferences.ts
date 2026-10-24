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

// Validate stored device preferences before applying them.
export function normalizePreferences(value: unknown): AppPreferences {
  const saved = value && typeof value === 'object' ? (value as Record<string, unknown>) : {};
  const result: AppPreferences = { ...defaultPreferences, taskViews: {} };
  if (saved.language === 'ko' || saved.language === 'en') {
    result.language = saved.language;
  }
  if (saved.theme === 'light' || saved.theme === 'dark' || saved.theme === 'system') {
    result.theme = saved.theme;
  }
  if (['tasks', 'matrix', 'calendar', 'habits'].includes(saved.startupView as string)) {
    result.startupView = saved.startupView as ProductArea;
  }
  if (saved.density === 'compact' || saved.density === 'comfortable') {
    result.density = saved.density;
  }
  if (saved.weekStartsOn === 0 || saved.weekStartsOn === 1) {
    result.weekStartsOn = saved.weekStartsOn;
  }
  if (saved.timeFormat === '12h' || saved.timeFormat === '24h') {
    result.timeFormat = saved.timeFormat;
  }
  if (typeof saved.showCompleted === 'boolean') {
    result.showCompleted = saved.showCompleted;
  }
  for (const key of [
    'recognizeDates',
    'removeDateText',
    'keepTagText',
    'calendarShowCompleted',
  ] as const) {
    if (typeof saved[key] === 'boolean') {
      result[key] = saved[key];
    }
  }
  if (calendarViews.includes(saved.calendarView as CalendarViewMode)) {
    result.calendarView = saved.calendarView as CalendarViewMode;
  }
  if (saved.taskViews && typeof saved.taskViews === 'object' && !Array.isArray(saved.taskViews)) {
    for (const [scope, options] of Object.entries(saved.taskViews)) {
      if (
        !['today', 'next', 'all', 'completed', 'trash'].includes(scope) &&
        !scope.startsWith('list:') &&
        !scope.startsWith('tag:')
      ) {
        continue;
      }
      if (!options || typeof options !== 'object') {
        continue;
      }
      const { sort, group } = options as TaskViewOptions;
      if (taskSorts.includes(sort) && taskGroups.includes(group)) {
        result.taskViews[scope] = { sort, group };
      }
    }
  }
  return result;
}
