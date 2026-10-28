import { Decimal } from 'decimal.js';
import { Temporal } from 'temporal-polyfill/implementation';
import type { Habit } from '../habits/habit.ts';
import { currentRule } from '../rules/habit-rule.ts';
import type { CheckInReading, HabitProgressSource } from './habit-progress.ts';

const addDays = (date: string, count: number) =>
  Temporal.PlainDate.from(date).add({ days: count }).toString();

function weekStart(date: string, startsOn: 0 | 1) {
  const day = Temporal.PlainDate.from(date);
  return day.subtract({ days: ((day.dayOfWeek % 7) - startsOn + 7) % 7 }).toString();
}

export interface WeeklyHabitAmount {
  from: string;
  through: string;
  goal: number;
  unit: string;
  value: number;
  excluded: number;
}

function period(habit: Pick<Habit, 'startDate' | 'rules'>, date: string, startsOn: 0 | 1) {
  const rule = currentRule(habit, date);
  const start = weekStart(date, startsOn);
  const next = habit.rules.find((candidate) => candidate.from > rule.from);
  return {
    from: [start, habit.startDate, rule.from].sort().at(-1)!,
    through: [addDays(start, 6), ...(next ? [addDays(next.from, -1)] : [])].sort()[0],
    goal: rule.goal,
    unit: rule.unit,
    value: 0,
    excluded: 0,
  };
}

function addReading(result: WeeklyHabitAmount, log: CheckInReading) {
  if (log.skipped || log.date < result.from || log.date > result.through) {
    return;
  }
  // A recorded unit is immutable; changing a goal never converts past measurements.
  if (log.unit !== undefined && log.unit !== result.unit) {
    if (log.value > 0) {
      result.excluded++;
    }
    return;
  }
  result.value = new Decimal(result.value).plus(log.value).toNumber();
}

export function weeklyHabitAmount(
  habit: HabitProgressSource,
  logs: CheckInReading[],
  date: string,
  startsOn: 0 | 1,
): WeeklyHabitAmount {
  const result = period(habit, date, startsOn);
  for (const log of logs) {
    if (log.habitId === habit.id) {
      addReading(result, log);
    }
  }
  return result;
}

export function weeklyAmountStatistics(
  habit: HabitProgressSource,
  logs: CheckInReading[],
  today: string,
  startsOn: 0 | 1,
) {
  const periods = new Map<string, WeeklyHabitAmount>();
  for (let date = habit.startDate; date <= today; date = addDays(date, 1)) {
    const rule = currentRule(habit, date);
    if (rule.frequency !== 'weekly-total') {
      continue;
    }
    const key = weekStart(date, startsOn) + ':' + rule.from;
    if (!periods.has(key)) {
      periods.set(key, period(habit, date, startsOn));
    }
  }
  for (const log of logs) {
    if (log.habitId !== habit.id || log.date > today || log.date < habit.startDate) {
      continue;
    }
    const rule = currentRule(habit, log.date);
    const target = periods.get(weekStart(log.date, startsOn) + ':' + rule.from);
    if (target) {
      addReading(target, log);
    }
  }
  const weeks = new Map<string, boolean>();
  for (const [key, value] of periods) {
    const week = key.slice(0, 10);
    weeks.set(week, (weeks.get(week) ?? true) && value.value >= value.goal);
  }
  const total = [...weeks.values()].filter(Boolean).length;
  let start = weekStart(today, startsOn),
    streak = 0;
  if (!weeks.get(start)) {
    start = addDays(start, -7);
  }
  while (weeks.get(start)) {
    streak++;
    start = addDays(start, -7);
  }
  return {
    total,
    streak,
    rate: weeks.size ? Math.round((total / weeks.size) * 100) : 0,
    week: weeklyHabitAmount(
      habit,
      logs.filter((log) => log.date <= today),
      today,
      startsOn,
    ).value,
  };
}
