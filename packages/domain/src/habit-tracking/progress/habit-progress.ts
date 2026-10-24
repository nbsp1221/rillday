import { Temporal } from 'temporal-polyfill/implementation';
import type { HabitCheckInData } from '../check-ins/check-in.ts';
import type { Habit } from '../habits/habit.ts';
import { currentRule, scheduled } from '../rules/habit-rule.ts';

export type HabitProgressSource = Pick<Habit, 'id' | 'startDate' | 'rules' | 'archived'>;

export type CheckInReading = Pick<HabitCheckInData, 'habitId' | 'date' | 'value' | 'skipped'> &
  Partial<Pick<HabitCheckInData, 'goal'>>;

const addDays = (date: string, days: number) =>
  Temporal.PlainDate.from(date).add({ days }).toString();

function startOfWeek(day: string, weekStartsOn: 0 | 1) {
  const date = Temporal.PlainDate.from(day);
  return date.subtract({ days: ((date.dayOfWeek % 7) - weekStartsOn + 7) % 7 }).toString();
}

export function completedCheckIn(
  habit: Pick<Habit, 'rules'>,
  log: CheckInReading | undefined,
): boolean {
  return (
    log !== undefined &&
    !log.skipped &&
    log.value >= (log.goal ?? currentRule(habit, log.date).goal)
  );
}

export function dailyHabitProgress(
  habit: HabitProgressSource,
  log: CheckInReading | undefined,
  date: string,
  today: string,
) {
  if (habit.archived || !scheduled(habit, date) || log?.skipped) {
    return { completed: 0, total: 0 };
  }
  return { completed: date <= today && completedCheckIn(habit, log) ? 1 : 0, total: 1 };
}

interface WeeklyPeriod {
  target: number;
  count: number;
}

function weeklyStreak(
  weekStart: string,
  created: string,
  currentTarget: number,
  periodAt: (start: string) => WeeklyPeriod | undefined,
) {
  let start = weekStart;
  if ((periodAt(start)?.count ?? 0) < currentTarget) {
    start = addDays(start, -7);
  }

  let streak = 0;
  while (addDays(start, 6) >= created) {
    const period = periodAt(start);
    if (!period || period.count < period.target) {
      break;
    }
    streak++;
    start = addDays(start, -7);
  }
  return streak;
}

function dailyStreak(
  habit: HabitProgressSource,
  logsByDate: ReadonlyMap<string, CheckInReading>,
  today: string,
) {
  const created = habit.startDate;
  let day = today;
  if (!completedCheckIn(habit, logsByDate.get(day))) {
    day = addDays(day, -1);
  }

  let streak = 0;
  while (day >= created) {
    if (currentRule(habit, day).frequency === 'weekly') {
      break;
    }
    const log = logsByDate.get(day);
    if (scheduled(habit, day) && !log?.skipped) {
      if (!completedCheckIn(habit, log)) {
        break;
      }
      streak++;
    }
    day = addDays(day, -1);
  }
  return streak;
}

function completionCounts(
  habit: HabitProgressSource,
  logsByDate: ReadonlyMap<string, CheckInReading>,
  today: string,
  weekStartsOn: 0 | 1,
) {
  const periods = new Map<string, WeeklyPeriod>();
  let expected = 0;
  let achieved = 0;
  for (let day = habit.startDate; day <= today; day = addDays(day, 1)) {
    const rule = currentRule(habit, day);
    const completed = completedCheckIn(habit, logsByDate.get(day));
    if (rule.frequency === 'weekly') {
      const start = startOfWeek(day, weekStartsOn);
      const period = periods.get(start) ?? { target: rule.weeklyTarget, count: 0 };
      // Changing week start can regroup rule dates into one week. Use its latest target.
      period.target = rule.weeklyTarget;
      if (completed) {
        period.count++;
      }
      periods.set(start, period);
    } else if (scheduled(habit, day) && !logsByDate.get(day)?.skipped) {
      expected++;
      if (completed) {
        achieved++;
      }
    }
  }

  for (const period of periods.values()) {
    expected += period.target;
    achieved += Math.min(period.count, period.target);
  }
  return { expected, achieved, periods };
}

export function habitStatistics(
  habit: HabitProgressSource,
  logs: CheckInReading[],
  today: string,
  weekStartsOn: 0 | 1,
): { total: number; streak: number; rate: number; week: number } {
  const logsByDate = new Map(
    logs
      .filter((log) => log.habitId === habit.id && log.date <= today)
      .map((log) => [log.date, log]),
  );
  const currentHabit = currentRule(habit, today);
  const weekStart = startOfWeek(today, weekStartsOn);
  const completed = [...logsByDate.values()].filter((log) => completedCheckIn(habit, log));
  const counts = completionCounts(habit, logsByDate, today, weekStartsOn);
  const streak =
    currentHabit.frequency === 'weekly'
      ? weeklyStreak(weekStart, habit.startDate, currentHabit.weeklyTarget, (start) =>
          counts.periods.get(start),
        )
      : dailyStreak(habit, logsByDate, today);
  return {
    total: completed.length,
    streak,
    rate: counts.expected ? Math.round((counts.achieved / counts.expected) * 100) : 0,
    week: completed.filter((log) => log.date >= weekStart).length,
  };
}
