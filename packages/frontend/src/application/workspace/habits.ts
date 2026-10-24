import {
  type HabitProgressSource,
  checkInRestriction,
  completedCheckIn,
  currentRule,
  dailyHabitProgress,
  habitStatistics,
  scheduled,
} from '@repo/domain';
import { deviceZone, todayIn } from '../context.ts';
import type { Habit, HabitLog } from './model.ts';
import { dateKey } from './dates.ts';

export function createHabitDraft(unit: string): Habit {
  return {
    id: crypto.randomUUID(),
    name: '',
    color: '#7d9cc4',
    icon: 'circle',
    kind: 'boolean',
    goal: 1,
    unit,
    frequency: 'daily',
    weekdays: [1, 2, 3, 4, 5],
    weeklyTarget: 3,
    intervalDays: 1,
    step: 1,
    reminderTime: null,
    archived: false,
    createdAt: new Date().toISOString(),
  };
}

function progressSource(habit: Habit): HabitProgressSource {
  const startDate = habitStartDate(habit);
  return {
    id: habit.id,
    archived: habit.archived,
    startDate,
    rules: habit.rules?.length
      ? habit.rules
      : [
          {
            from: startDate,
            kind: habit.kind,
            goal: habit.goal,
            unit: habit.unit,
            step: habit.step ?? 1,
            frequency: habit.frequency,
            weekdays: habit.weekdays,
            weeklyTarget: habit.weeklyTarget,
            intervalDays: habit.intervalDays ?? 1,
          },
        ],
  };
}

export function canEditHabitLog(habit: Habit, date: string, logs: HabitLog[]): boolean {
  return (
    checkInRestriction(
      progressSource(habit),
      date,
      habitToday(habit),
      Boolean(habitLogFor(logs, habit.id, date)),
    ) === null
  );
}

export function habitAt(habit: Habit, date: string): Habit {
  return habit.rules?.length ? { ...habit, ...currentRule({ rules: habit.rules }, date) } : habit;
}

export function habitToday(habit: Habit, now?: string): string {
  return todayIn(habit.zone ?? deviceZone(), now);
}

export function habitStartDate(habit: Habit): string {
  return habit.startDate ?? todayIn(habit.zone ?? deviceZone(), habit.createdAt);
}

export function habitScheduled(habit: Habit, date: string): boolean {
  return scheduled(progressSource(habit), date);
}

export function habitLogFor(logs: HabitLog[], habitId: string, date: string): HabitLog | undefined {
  return logs.find((log) => log.habitId === habitId && log.date === date);
}

export function habitDone(habit: Habit, log: HabitLog | undefined): boolean {
  return completedCheckIn(progressSource(habit), log);
}

export function habitDayProgress(habits: Habit[], logs: HabitLog[], date: string, today?: string) {
  return habits.reduce(
    (total, habit) => {
      const progress = dailyHabitProgress(
        progressSource(habit),
        habitLogFor(logs, habit.id, date),
        date,
        today ?? habitToday(habit),
      );
      return {
        completed: total.completed + progress.completed,
        total: total.total + progress.total,
      };
    },
    { completed: 0, total: 0 },
  );
}

export function habitStats(
  habit: Habit,
  logs: HabitLog[],
  today = dateKey(),
  weekStartsOn: 0 | 1 = 1,
) {
  return habitStatistics(progressSource(habit), logs, today, weekStartsOn);
}

export type HabitCheckinAction =
  | { type: 'amount'; value: number }
  | { type: 'note'; text: string }
  | { type: 'step'; direction: 'increase' | 'decrease' }
  | { type: 'complete' | 'skip' | 'reset' };
