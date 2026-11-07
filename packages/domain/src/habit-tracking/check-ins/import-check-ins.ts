import { Decimal } from 'decimal.js';
import { v5 as uuidV5 } from 'uuid';
import type { DomainContext } from '../../shared-kernel/clock.ts';
import type { Workspace } from '../../workspace/workspace.ts';
import { canonical } from '../../shared-kernel/canonical.ts';
import { Fault } from '../../shared-kernel/fault.ts';
import { todayIn } from '../../task-management/scheduling/clock.ts';
import { requireHabit } from '../habits/manage-habits.ts';
import { currentRule } from '../rules/habit-rule.ts';
import type { HabitCheckInData } from './check-in.ts';
import { habitLogSchema } from './check-in.ts';
import { checkInId } from './record-check-in.ts';
import { recordQuantity } from './recorded-quantity.ts';
import { recordingTimeIdentity } from './recording-time.ts';

export type HistoricalCheckIn = Omit<HabitCheckInData, 'habitId' | 'ruleFrom'>;

export function historicalHabitId(namespace: string, sourceKey: string): string {
  return uuidV5(canonical([namespace, sourceKey]), uuidV5.URL);
}

export function historicalCheckInIdentity(log: HistoricalCheckIn): string {
  return canonical({ ...log, recordedAt: recordingTimeIdentity(log.recordedAt) });
}

// History initialization preserves source snapshots without weakening live recording rules.
export function importCheckIns(
  workspace: Workspace,
  habitId: string,
  history: readonly { snapshot: HistoricalCheckIn; baseVersion: string }[],
  context: DomainContext,
) {
  const habit = requireHabit(workspace, habitId);
  const seen = new Set<string>();
  const accepted = history.map(({ snapshot, baseVersion }) => {
    const rule = currentRule(habit, snapshot.date);
    const log = habitLogSchema.parse({ ...snapshot, habitId, ruleFrom: rule.from });
    if (
      log.date < habit.startDate ||
      log.date > todayIn(habit.zone, context.now()) ||
      seen.has(log.date)
    ) {
      throw new Fault('invalid_log_date');
    }
    if (
      new Decimal(log.value).decimalPlaces() > 6 ||
      (rule.kind === 'boolean' && (log.goal !== 1 || (log.value !== 0 && log.value !== 1)))
    ) {
      throw new Fault('invalid_habitLog');
    }
    seen.add(log.date);
    const id = checkInId(habitId, log.date);
    // Identical imports share a generation only when based on the same record revision.
    const generation = uuidV5(
      canonical([id, baseVersion, historicalCheckInIdentity(snapshot)]),
      uuidV5.URL,
    );
    const { value, ...fields } = log;
    return { ...fields, id, quantity: recordQuantity(value, generation) };
  });
  for (const log of accepted) {
    workspace.checkIns[log.id] = log;
  }
}
