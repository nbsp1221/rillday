import { expect, test } from 'vitest';
import { createWorkspace } from '../../workspace/create-workspace.ts';
import { createHabit, editHabit, removeHabit } from '../habits/manage-habits.ts';
import { checkInId, incrementCheckIn, recordCheckIn } from './record-check-in.ts';
import { quantityValue } from './recorded-quantity.ts';

const context = { now: () => '2026-10-23T10:00:00.000Z', newId: () => crypto.randomUUID() };

function fixture() {
  const workspace = createWorkspace(context);
  const id = context.newId();
  const data = {
    name: 'Water',
    color: '#123456',
    icon: 'glass-water',
    archived: false,
    startDate: '2026-10-01',
    rules: [
      {
        from: '2026-10-01',
        kind: 'quantity',
        goal: 8,
        unit: 'cups',
        step: 0.1,
        frequency: 'daily',
        weekdays: [],
        weeklyTarget: 3,
        intervalDays: 1,
      },
    ],
    reminderTime: null,
    zone: 'UTC',
    rank: 'a0',
  };
  createHabit(workspace, id, data, context);
  return { workspace, id, data };
}

test('quantity increments retain decimal precision and protect skipped entries', () => {
  const { workspace, id } = fixture();
  for (let index = 0; index < 10; index++) {
    incrementCheckIn(workspace, id, '2026-10-23', 0.1, context);
  }
  const key = checkInId(id, '2026-10-23');
  expect(quantityValue(workspace.checkIns[key].quantity)).toBe(1);
  recordCheckIn(workspace, id, '2026-10-23', { skipped: true }, context);
  expect(() => incrementCheckIn(workspace, id, '2026-10-23', 1, context)).toThrow(
    'skipped_conflict',
  );
});

test('check-ins enforce calendar and habit boundaries and retain the captured rule on later edits', () => {
  const { workspace, id, data } = fixture();
  expect(() => recordCheckIn(workspace, id, '2026-02-30', { value: 1 }, context)).toThrow(
    'invalid_log_target',
  );
  expect(() => recordCheckIn(workspace, id, '2026-10-24', { value: 1 }, context)).toThrow(
    'invalid_log_date',
  );
  recordCheckIn(workspace, id, '2026-10-22', { value: 2 }, context);
  editHabit(
    workspace,
    id,
    { ...data, rules: [...data.rules, { ...data.rules[0], from: '2026-10-23', goal: 10 }] },
    0,
    context,
  );
  recordCheckIn(workspace, id, '2026-10-22', { note: 'Keep the old goal' }, context);
  expect(quantityValue(workspace.checkIns[checkInId(id, '2026-10-22')].quantity)).toBe(2);
  expect(workspace.checkIns[checkInId(id, '2026-10-22')]).toMatchObject({
    goal: 8,
    ruleFrom: '2026-10-01',
  });
  expect(() =>
    editHabit(workspace, id, { ...data, rules: [{ ...data.rules[0], goal: 12 }] }, 0, context),
  ).toThrow('historical_rule_immutable');
  const checkIns = structuredClone(workspace.checkIns);
  editHabit(
    workspace,
    id,
    { ...data, rules: workspace.habits[id].rules, archived: true },
    0,
    context,
  );
  expect(() => incrementCheckIn(workspace, id, '2026-10-22', 1, context)).toThrow('habit_archived');
  expect(workspace.checkIns).toEqual(checkIns);
  removeHabit(workspace, id);
  expect(workspace.habits[id]).toBeUndefined();
  expect(Object.values(workspace.checkIns)).toHaveLength(0);
});
