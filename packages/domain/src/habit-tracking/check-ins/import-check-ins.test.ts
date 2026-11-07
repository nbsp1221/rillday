import { expect, test } from 'vitest';
import { createWorkspace } from '../../workspace/create-workspace.ts';
import { createHabit } from '../habits/manage-habits.ts';
import { historicalCheckInIdentity, importCheckIns } from './import-check-ins.ts';
import { checkInId, recordCheckIn } from './record-check-in.ts';
import { quantityValue } from './recorded-quantity.ts';
import { recordingTimeIdentity, recordingTimeSchema } from './recording-time.ts';

const context = { now: () => '2026-11-06T12:00:00Z', newId: () => crypto.randomUUID() };

function fixture() {
  const workspace = createWorkspace(context);
  const id = context.newId();
  createHabit(
    workspace,
    id,
    {
      name: 'Read',
      color: '#123456',
      icon: 'circle',
      archived: true,
      startDate: '2024-01-01',
      zone: 'Asia/Seoul',
      rank: 'a0',
      reminderTime: null,
      rules: [
        {
          from: '2024-01-01',
          kind: 'quantity',
          goal: 20,
          unit: 'min',
          step: 1,
          frequency: 'daily',
          weekdays: [],
          weeklyTarget: 3,
          intervalDays: 1,
        },
      ],
    },
    context,
  );
  return { workspace, id };
}

const record = {
  date: '2024-02-29',
  value: 15,
  goal: 10,
  unit: 'min',
  skipped: false,
  note: 'History',
  recordedAt: { kind: 'time' as const, value: '21:30' },
};

test('history preserves snapshots and time-only precision without manufacturing a timestamp', () => {
  const { workspace, id } = fixture();
  const history = [{ snapshot: record, baseVersion: 'initial' }];
  importCheckIns(workspace, id, history, context);
  const log = workspace.checkIns[checkInId(id, record.date)];
  expect.assert(log !== undefined);
  expect(log).toMatchObject({
    recordedAt: { kind: 'time', value: '21:30' },
    goal: 10,
    unit: 'min',
    ruleFrom: '2024-01-01',
  });
  expect(quantityValue(log.quantity)).toBe(15);
  const before = structuredClone(log);
  importCheckIns(workspace, id, history, context);
  expect(workspace.checkIns[checkInId(id, record.date)]).toEqual(before);
});

test('history rejects duplicate, future, pre-start and rounded amounts before modifying data', () => {
  const { workspace, id } = fixture();
  for (const records of [
    [record, record],
    [record, { ...record, date: '2027-01-01' }],
    [{ ...record, date: '2023-01-01' }],
    [{ ...record, value: 0.0000001 }],
  ]) {
    const history = records.map((snapshot) => ({ snapshot, baseVersion: 'initial' }));
    expect(() => importCheckIns(workspace, id, history, context)).toThrow();
    expect(workspace.checkIns).toEqual({});
  }
});

test('time validation distinguishes instants, civil date-times and time-only export values', () => {
  for (const time of [
    { kind: 'instant', value: '2024-02-29T21:30:00+09:00' },
    { kind: 'unqualified', value: '2024-02-29T21:30' },
    { kind: 'time', value: '21:30' },
  ]) {
    expect(recordingTimeSchema.safeParse(time).success).toBe(true);
  }
  for (const time of [
    { kind: 'instant', value: '2024-02-29T21:30' },
    { kind: 'instant', value: '2024-02-29T21:30:00-00:00' },
    { kind: 'unqualified', value: '2024-02-30T21:30' },
    { kind: 'time', value: '25:00' },
    { kind: 'time', value: '12:30:60' },
  ]) {
    expect(recordingTimeSchema.safeParse(time).success).toBe(false);
  }
  expect(recordingTimeIdentity({ kind: 'instant', value: '2024-02-29T21:30:00+09:00' })).toBe(
    recordingTimeIdentity({ kind: 'instant', value: '2024-02-29T12:30:00Z' }),
  );
  expect(historicalCheckInIdentity(record)).not.toBe(
    historicalCheckInIdentity({ ...record, recordedAt: undefined }),
  );
});

test('normal edits capture recording time once and never backfill unknown history', () => {
  const { workspace, id } = fixture();
  const habit = workspace.habits[id];
  expect.assert(habit !== undefined);
  habit.archived = false;
  recordCheckIn(workspace, id, '2024-02-29', { value: 1 }, context);
  const key = checkInId(id, '2024-02-29');
  expect(workspace.checkIns[key]?.recordedAt).toEqual({ kind: 'instant', value: context.now() });
  recordCheckIn(
    workspace,
    id,
    '2024-02-29',
    { value: 2 },
    { ...context, now: () => '2026-11-07T12:00:00Z' },
  );
  expect(workspace.checkIns[key]?.recordedAt?.value).toBe(context.now());
  const log = workspace.checkIns[key];
  expect.assert(log !== undefined);
  delete log.recordedAt;
  recordCheckIn(workspace, id, '2024-02-29', { note: 'Edit' }, context);
  expect(workspace.checkIns[key]?.recordedAt).toBeUndefined();
});
