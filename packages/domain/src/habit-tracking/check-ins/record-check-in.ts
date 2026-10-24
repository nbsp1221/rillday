import { v5 as uuidV5 } from 'uuid';
import type { DomainContext } from '../../shared-kernel/clock.ts';
import type { Workspace } from '../../workspace/workspace.ts';
import { Fault } from '../../shared-kernel/fault.ts';
import { dateSchema, uuid } from '../../shared-kernel/values.ts';
import { todayIn } from '../../task-management/scheduling/clock.ts';
import { requireHabit } from '../habits/manage-habits.ts';
import { currentRule } from '../rules/habit-rule.ts';
import { checkInRestriction } from './check-in-availability.ts';
import { type HabitCheckInData, habitLogSchema } from './check-in.ts';
import { incrementQuantity, quantityValue, recordQuantity } from './recorded-quantity.ts';

export type CheckInEdit = Partial<Pick<HabitCheckInData, 'value' | 'skipped' | 'note'>>;

const editSchema = habitLogSchema.pick({ value: true, skipped: true, note: true }).partial();

export function checkInId(habitId: string, date: string) {
  if (!uuid.safeParse(habitId).success || !dateSchema.safeParse(date).success) {
    throw new Fault('invalid_log_target');
  }
  return uuidV5(habitId + ':' + date, uuidV5.URL);
}

export function recordCheckIn(
  workspace: Workspace,
  habitId: string,
  date: string,
  input: CheckInEdit,
  context: DomainContext,
) {
  const id = checkInId(habitId, date);
  const habit = requireHabit(workspace, habitId);
  const previous = workspace.checkIns[id];
  const restriction = checkInRestriction(
    habit,
    date,
    todayIn(habit.zone, context.now()),
    Boolean(previous),
  );
  if (restriction) {
    throw new Fault(restriction, restriction === 'habit_archived' ? 'conflict' : 'invalid');
  }
  const patch = editSchema.safeParse(input);
  if (!patch.success) {
    throw new Fault('invalid_log_patch');
  }
  const rule = currentRule(habit, date);
  const {
    id: _id,
    quantity: previousQuantity,
    ...data
  } = previous ?? {
    id,
    habitId,
    date,
    quantity: recordQuantity(0, id),
    skipped: false,
    note: '',
    goal: rule.goal,
    unit: rule.unit,
    ruleFrom: rule.from,
  };
  const previousValue = quantityValue(previousQuantity);
  const parsed = habitLogSchema.safeParse({ ...data, value: previousValue, ...patch.data });
  if (!parsed.success) {
    throw new Fault('invalid_habitLog');
  }
  const { value, ...fields } = parsed.data;
  const quantity = Object.hasOwn(patch.data, 'value')
    ? recordQuantity(value, context.newId())
    : previousQuantity;
  workspace.checkIns[id] = { ...fields, quantity, id };
}

export function incrementCheckIn(
  workspace: Workspace,
  habitId: string,
  date: string,
  amount: number,
  context: DomainContext,
) {
  if (!Number.isFinite(amount) || Math.abs(amount) > 1000000) {
    throw new Fault('invalid_increment');
  }
  const previous = workspace.checkIns[checkInId(habitId, date)];
  if (previous?.skipped) {
    throw new Fault('skipped_conflict', 'conflict');
  }
  const quantity = incrementQuantity(
    previous?.quantity ?? recordQuantity(0, checkInId(habitId, date)),
    amount,
    context.newId(),
  );
  recordCheckIn(workspace, habitId, date, {}, context);
  workspace.checkIns[checkInId(habitId, date)].quantity = quantity;
}
