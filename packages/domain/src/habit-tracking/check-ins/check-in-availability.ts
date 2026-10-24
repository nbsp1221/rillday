import type { Habit } from '../habits/habit.ts';
import { scheduled } from '../rules/habit-rule.ts';

export function checkInRestriction(
  habit: Pick<Habit, 'archived' | 'startDate' | 'rules'>,
  date: string,
  today: string,
  recorded: boolean,
): 'habit_archived' | 'invalid_log_date' | 'habit_not_scheduled' | null {
  if (habit.archived) {
    return 'habit_archived';
  }
  if (date > today || date < habit.startDate) {
    return 'invalid_log_date';
  }
  return !recorded && !scheduled(habit, date) ? 'habit_not_scheduled' : null;
}
