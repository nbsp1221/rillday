import type { CSSProperties } from 'react';
import type { Habit } from '#application';
import { useAppPreferences } from '#entities/preferences';
import { useI18n } from '#shared/i18n';

export function habitColors(color: string): CSSProperties & {
  '--habit-color': string;
  '--habit-on-color': string;
} {
  const linearRgb = /^#[0-9a-f]{6}$/i.test(color)
    ? [color.slice(1, 3), color.slice(3, 5), color.slice(5, 7)]
        .map((value) => parseInt(value, 16) / 255)
        .map((value) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4))
    : [0, 0, 0];
  const luminance = 0.2126 * linearRgb[0] + 0.7152 * linearRgb[1] + 0.0722 * linearRgb[2];
  return {
    '--habit-color': color,
    '--habit-on-color': luminance > 0.179 ? '#000000' : '#ffffff',
  };
}

export function useHabitDisplay() {
  const { t, weekdayNames: dayNames } = useI18n();
  const { preferences } = useAppPreferences();
  const weekdayOrder = Array.from({ length: 7 }, (_, i) => (preferences.weekStartsOn + i) % 7);

  function scheduleLabel(habit: Habit) {
    switch (habit.frequency) {
      case 'weekly-total':
        return t('habits.frequencyWeeklyTotal');
      case 'weekly':
        return t('habits.weeklyDays', { count: habit.weeklyTarget });
      case 'weekdays':
        return habit.weekdays
          .slice()
          .sort((a, b) => weekdayOrder.indexOf(a) - weekdayOrder.indexOf(b))
          .map((day) => dayNames[day])
          .join(' · ');
      case 'interval':
        return t('habits.everyDays', { count: habit.intervalDays || 1 });
      case 'daily':
        return t('dates.everyDay');
    }
  }

  return { weekdayOrder, dayNames, scheduleLabel };
}
