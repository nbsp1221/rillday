import { z } from 'zod';
import { color, dateSchema, rank, time, zone } from '../../shared-kernel/values.ts';
import { type HabitRule, habitRuleSchema } from '../rules/habit-rule.ts';

function validHabitRuleHistory(habit: { startDate: string; rules: HabitRule[] }): boolean {
  const first = habit.rules[0];
  if (!first || first.from !== habit.startDate) {
    return false;
  }

  return habit.rules.every((rule, index) => {
    if (index === 0) {
      return true;
    }

    const previous = habit.rules[index - 1];
    return rule.from > previous.from;
  });
}

export const habitSchema = z
  .strictObject({
    name: z.string().trim().min(1).max(120),
    color,
    icon: z.string().min(1).max(60),
    archived: z.boolean(),
    startDate: dateSchema,
    rules: z.array(habitRuleSchema).min(1).max(100),
    reminderTime: time.nullable(),
    zone,
    rank,
  })
  .refine(validHabitRuleHistory);

export type HabitData = z.infer<typeof habitSchema>;

export interface Habit extends HabitData {
  id: string;
  createdAt: string;
}
