import type { DomainContext } from '../../shared-kernel/clock.ts';
import type { Workspace } from '../../workspace/workspace.ts';
import { Fault } from '../../shared-kernel/fault.ts';
import { uuid } from '../../shared-kernel/values.ts';
import { todayIn } from '../../task-management/scheduling/clock.ts';
import { validateHabitRuleTransition } from '../rules/habit-rule.ts';
import { type Habit, type HabitData, habitSchema } from './habit.ts';

function validateHabit(input: unknown): HabitData {
  const parsed = habitSchema.safeParse(input);
  if (!parsed.success) {
    throw new Fault('invalid_habit');
  }
  return parsed.data;
}

export function requireHabit(workspace: Workspace, id: string): Habit {
  const habit = workspace.habits[id];
  if (!habit) {
    throw new Fault('not_found', 'not-found');
  }
  return habit;
}

export function createHabit(
  workspace: Workspace,
  id: string,
  input: unknown,
  context: DomainContext,
) {
  if (!uuid.safeParse(id).success) {
    throw new Fault('invalid_id');
  }
  if (workspace.habits[id]) {
    throw new Fault('id_exists', 'conflict');
  }
  workspace.habits[id] = { ...validateHabit(input), id, createdAt: context.now() };
}

export function editHabit(
  workspace: Workspace,
  id: string,
  input: unknown,
  weekStartsOn: 0 | 1,
  context: DomainContext,
) {
  const habit = requireHabit(workspace, id);
  const data = validateHabit(input);
  validateHabitRuleTransition(habit, data, todayIn(data.zone, context.now()), weekStartsOn);
  Object.assign(habit, data);
}

export function removeHabit(workspace: Workspace, id: string) {
  requireHabit(workspace, id);
  for (const checkIn of Object.values(workspace.checkIns)) {
    if (checkIn.habitId === id) {
      delete workspace.checkIns[checkIn.id];
    }
  }
  delete workspace.habits[id];
}
