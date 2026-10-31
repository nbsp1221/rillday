import { Temporal } from 'temporal-polyfill/implementation';
import { z } from 'zod';
import { canonical } from '../../shared-kernel/canonical.ts';
import { Fault } from '../../shared-kernel/fault.ts';
import { dateSchema, habitAmountSchema } from '../../shared-kernel/values.ts';

export const habitRuleSchema = z
  .strictObject({
    from: dateSchema,
    kind: z.enum(['boolean', 'quantity']),
    goal: habitAmountSchema,
    unit: z.string().trim().min(1).max(20),
    step: habitAmountSchema,
    frequency: z.enum(['daily', 'weekdays', 'weekly', 'interval', 'weekly-total']),
    weekdays: z.array(z.int().min(0).max(6)).max(7),
    weeklyTarget: z.int().min(1).max(7),
    intervalDays: z.int().min(1).max(30),
  })
  .refine(
    (v) =>
      new Set(v.weekdays).size === v.weekdays.length &&
      (v.frequency !== 'weekdays' || v.weekdays.length > 0) &&
      (v.frequency !== 'weekly-total' || v.kind === 'quantity'),
  );

export type HabitRule = z.infer<typeof habitRuleSchema>;

export function isWeeklyHabitRule(rule: Pick<HabitRule, 'frequency'>) {
  return rule.frequency === 'weekly' || rule.frequency === 'weekly-total';
}

function habitRuleEffectiveDate(today: string, weekly: boolean, weekStartsOn: 0 | 1) {
  if (!weekly) {
    return today;
  }
  const day = Temporal.PlainDate.from(today);
  const elapsed = ((day.dayOfWeek % 7) - weekStartsOn + 7) % 7;
  return elapsed === 0 ? today : day.add({ days: 7 - elapsed }).toString();
}

export function reviseHabitRules(
  previous: { rules: HabitRule[] },
  next: HabitRule,
  today: string,
  weekStartsOn: 0 | 1,
): HabitRule[] {
  const current = currentRule(previous, today);
  const { from: _oldDate, ...oldFields } = current;
  const { from: _newDate, ...newFields } = next;
  if (canonical(oldFields) === canonical(newFields)) {
    return previous.rules;
  }
  const from = habitRuleEffectiveDate(
    today,
    isWeeklyHabitRule(current) || isWeeklyHabitRule(next),
    weekStartsOn,
  );
  return [...previous.rules.filter((rule) => rule.from < from), { ...next, from }];
}

export function validateHabitRuleTransition(
  previous: { rules: HabitRule[] },
  next: { rules: HabitRule[] },
  today: string,
  weekStartsOn: unknown,
) {
  const same = (left: HabitRule, right: HabitRule) => canonical(left) === canonical(right);

  for (const rule of previous.rules) {
    if (rule.from < today && !next.rules.some((candidate) => same(candidate, rule))) {
      throw new Fault('historical_rule_immutable', 'conflict');
    }
  }
  for (const rule of next.rules) {
    if (previous.rules.some((candidate) => same(candidate, rule))) {
      continue;
    }
    if (rule.from < today) {
      throw new Fault('historical_rule_immutable', 'conflict');
    }
    const weekly = isWeeklyHabitRule(currentRule(previous, rule.from)) || isWeeklyHabitRule(rule);
    if (!weekly) {
      continue;
    }
    if (weekStartsOn !== 0 && weekStartsOn !== 1) {
      throw new Fault('invalid_habit_week_start');
    }
    if (
      rule.from < habitRuleEffectiveDate(today, true, weekStartsOn) ||
      Temporal.PlainDate.from(rule.from).dayOfWeek % 7 !== weekStartsOn
    ) {
      throw new Fault('habit_rule_requires_week_boundary', 'conflict');
    }
  }
}

export function currentRule(habit: { rules: HabitRule[] }, day: string): HabitRule {
  return [...habit.rules].reverse().find((entry) => entry.from <= day) ?? habit.rules[0];
}

export function scheduled(habit: { startDate: string; rules: HabitRule[] }, day: string): boolean {
  if (day < habit.startDate) {
    return false;
  }
  const rule = currentRule(habit, day);
  const date = Temporal.PlainDate.from(day);

  if (rule.frequency === 'weekdays') {
    return rule.weekdays.includes(date.dayOfWeek % 7);
  }

  if (rule.frequency === 'interval') {
    return Temporal.PlainDate.from(rule.from).until(date).days % rule.intervalDays === 0;
  }

  return true;
}
