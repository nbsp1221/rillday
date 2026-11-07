import assert from 'node:assert/strict';
import { expect, test } from 'vitest';
import * as XLSX from 'xlsx';
import { maximumImportRows, parseHabitFile } from './parse-habits.ts';

const info =
  'Basic Information\nHabit Name: Read a book\nQuote: \nHabit Status: NORMAL\nGoal: 20 min/day\nSection: Others\nReminder: \nFrequency: every day';
const header = ['Date', 'Time', 'Status', 'Total check-ins', 'Mood', 'Habit Log'];

function excel(rows: unknown[][], date1904 = false, metadata = info) {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    book,
    XLSX.utils.aoa_to_sheet([[metadata], ['Date:2024-01-01~2024-12-31'], header, ...rows]),
    'Reading',
  );
  book.Workbook = { WBProps: { date1904 } };
  const bytes: unknown = XLSX.write(book, { type: 'array', bookType: 'xlsx' });
  assert(bytes instanceof ArrayBuffer);
  return {
    bytes,
    name: 'habits.xlsx',
    source: 'ticktick' as const,
  };
}

function csv(body: string) {
  return {
    bytes: new TextEncoder().encode(
      'habit_key,habit_name,kind,date,value,goal,unit,skipped,recorded_at,note\n' + body,
    ).buffer,
    name: 'habits.csv',
    source: 'rillday' as const,
  };
}

test('observed TickTick workbook profile retains original time only and note, with explicit loss warnings', () => {
  const result = parseHabitFile(
    excel([['2024-02-29', '21:30', 'Completed', '20', 'Happy', 'One chapter']]),
  );
  expect(result.groups[0]?.errors).toEqual([]);
  expect(result.groups[0]?.records[0]).toEqual({
    date: '2024-02-29',
    value: 20,
    goal: 20,
    unit: 'min',
    skipped: false,
    note: 'One chapter',
    recordedAt: { kind: 'time', value: '21:30' },
  });
  expect(result.groups[0]?.warnings).toContain('historical_goals_unavailable');
  expect(result.groups[0]?.warnings).toContain('mood_not_imported');
  expect(
    parseHabitFile(excel([['2024-02-29', '', 'Completed', 20]])).groups[0]?.records[0]?.recordedAt,
  ).toBeUndefined();
});

test('unknown status and invalid dates are visible errors, never guessed as zero, skipped or success', () => {
  const group = parseHabitFile(
    excel([
      ['2024-02-29', '21:30', 'Unknown', 20],
      ['2024-02-30', '21:30', 'Completed', 20],
    ]),
  ).groups[0];
  assert(group);
  expect(group.records).toEqual([]);
  expect(group.errors.map((e) => e.row)).toEqual([4, 5]);
  expect(group.errors[0]?.code).toBe('unsupported_ticktick_status');
});

test('CSV preserves absent days, recorded zero, skipped and offset/civil/time-only values', () => {
  const result = parseHabitFile(
    csv(
      'r,Read,quantity,2024-02-27,0,20,min,false,,\nr,Read,quantity,2024-02-28,0,20,min,true,21:30,Rest\nr,Read,quantity,2024-02-29,15,10,min,false,2024-02-29T21:30:00+09:00,Earlier goal\nr,Read,quantity,2024-03-01,20,20,min,false,2024-03-01T21:30,\n',
    ),
  );
  expect(result.groups[0]?.errors).toEqual([]);
  expect(result.groups[0]?.records).toHaveLength(4);
  expect(result.groups[0]?.records[0]?.recordedAt).toBeUndefined();
  expect(result.groups[0]?.records[1]?.skipped).toBe(true);
  expect(result.groups[0]?.records[2]?.goal).toBe(10);
  expect(result.groups[0]?.records[3]?.recordedAt?.kind).toBe('unqualified');
});

test('duplicate rows are deduplicated while differing daily rows are blocked', () => {
  const line = 'r,Read,quantity,2024-02-29,20,20,min,false,21:30,\n';
  expect(parseHabitFile(csv(line + line)).groups[0]?.records).toHaveLength(1);
  expect(
    parseHabitFile(csv(line + line.replace(',20,20,', ',30,20,'))).groups[0]?.errors[0]?.code,
  ).toBe('duplicate_import_date');
});

test('unknown habit states are blocked and blank lines retain source row numbers', () => {
  expect(
    parseHabitFile(excel([], false, info.replace('NORMAL', 'ARCHIVED'))).groups[0]?.errors,
  ).toEqual([{ row: 1, code: 'unsupported_ticktick_status' }]);
  const group = parseHabitFile(
    csv(
      'r,Read,quantity,2024-02-29,20,20,min,false,,\n\nr,Read,quantity,2024-02-30,20,20,min,false,,\n',
    ),
  ).groups[0];
  expect(group?.records).toHaveLength(1);
  expect(group?.errors[0]?.row).toBe(4);
});

test('equivalent offset timestamps do not create false duplicate conflicts', () => {
  const group = parseHabitFile(
    csv(
      'r,Read,quantity,2024-02-29,20,20,min,false,2024-02-29T21:30:00+09:00,\nr,Read,quantity,2024-02-29,20,20,min,false,2024-02-29T12:30:00Z,\n',
    ),
  ).groups[0];
  expect(group?.records).toHaveLength(1);
  expect(group?.errors).toEqual([]);
});

test('an invalid first CSV row blocks its habit without hiding other valid groups', () => {
  const result = parseHabitFile(
    csv(
      'bad,Invalid,quantity,2024-02-29,20,invalid,min,false,,\ngood,Read,quantity,2024-02-29,20,20,min,false,,\n',
    ),
  );
  expect(result.groups[0]?.errors).toEqual([{ row: 2, code: 'invalid_import_amount' }]);
  expect(result.groups[1]?.records).toHaveLength(1);
  expect(result.groups[1]?.goal).toBe(20);
});

test('spreadsheet epochs and fictitious leap date are handled without browser timezone conversion', () => {
  expect(
    parseHabitFile(excel([[1, 0.5, 'Completed', 20]], true)).groups[0]?.records[0],
  ).toMatchObject({ date: '1904-01-02', recordedAt: { kind: 'time', value: '12:00:00' } });
  expect(parseHabitFile(excel([[60, 0.5, 'Completed', 20]])).groups[0]?.errors).toHaveLength(1);
});

test('rejects unknown layouts, formulas and excessive input instead of importing partial data', () => {
  expect(() =>
    parseHabitFile(excel([['2024-02-29', '21:30', 'Completed', { f: '1+1', t: 'n', v: 20 }]])),
  ).toThrow('import_formula_unsupported');
  expect(() => parseHabitFile({ ...csv(''), bytes: new ArrayBuffer(8 * 1024 * 1024 + 1) })).toThrow(
    'import_too_large',
  );
  expect(() =>
    parseHabitFile(
      csv(
        Array.from(
          { length: maximumImportRows + 1 },
          () => 'r,Read,quantity,2024-02-29,20,20,min,false,,',
        ).join('\n'),
      ),
    ),
  ).toThrow('import_too_large');
});
