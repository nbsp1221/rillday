import {
  type HistoricalCheckIn,
  hash,
  historicalCheckInIdentity,
  recordingTimeSchema,
} from '@repo/domain';
import { Temporal } from 'temporal-polyfill/implementation';
import * as XLSX from 'xlsx';
import { z } from 'zod';
import type {
  HabitImportDraft,
  HabitImportGroup,
} from '../../application/importing/habit-import.ts';

export const maximumImportBytes = 8 * 1024 * 1024;
export const maximumImportRows = 20_000;
const csvHeaders = ['habit_key', 'habit_name', 'kind', 'date', 'value', 'goal', 'unit'];
const tickTickHeaders = ['Date', 'Time', 'Status', 'Total check-ins', 'Mood', 'Habit Log'];

const dateCodeSchema = z
  .object({
    y: z.number(),
    m: z.number(),
    d: z.number(),
    H: z.number(),
    M: z.number(),
    S: z.number(),
    u: z.number(),
  })
  .nullable();
const dateCodes = z
  .object({
    parse_date_code: z.custom<(value: number, options?: { date1904: boolean }) => unknown>(
      (value) => typeof value === 'function',
    ),
  })
  .parse(XLSX.SSF);

function text(value: unknown): string {
  if (value === undefined || value === null) {
    return '';
  }
  if (typeof value === 'string' || typeof value === 'number') {
    return String(value);
  }
  throw new Error('invalid_import_cell');
}

function decimal(value: unknown): number {
  const raw = text(value).trim();
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,6})?$/.test(raw)) {
    throw new Error('invalid_import_amount');
  }
  const amount = Number(raw);
  if (!Number.isFinite(amount) || amount > 1_000_000_000) {
    throw new Error('invalid_import_amount');
  }
  return amount;
}

function date(value: unknown, date1904: boolean): string {
  if (typeof value === 'number') {
    if (!Number.isInteger(value) || (!date1904 && value === 60)) {
      throw new Error('invalid_import_date');
    }
    const parsed = dateCodeSchema.parse(dateCodes.parse_date_code(value, { date1904 }));
    if (!parsed) {
      throw new Error('invalid_import_date');
    }
    return Temporal.PlainDate.from(
      { year: parsed.y, month: parsed.m, day: parsed.d },
      { overflow: 'reject' },
    ).toString();
  }
  const raw = text(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    throw new Error('invalid_import_date');
  }
  return Temporal.PlainDate.from(raw).toString();
}

function recordedAt(value: unknown): HistoricalCheckIn['recordedAt'] {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  let raw: string;
  if (typeof value === 'number') {
    if (value < 0 || value >= 1) {
      throw new Error('invalid_import_time');
    }
    const parts = dateCodeSchema.parse(dateCodes.parse_date_code(value));
    if (!parts || parts.u !== 0) {
      throw new Error('invalid_import_time');
    }
    raw = [parts.H, parts.M, parts.S].map((part) => String(part).padStart(2, '0')).join(':');
  } else {
    raw = text(value);
  }
  const kind = /^\d\d:/.test(raw)
    ? 'time'
    : /(?:Z|[+-]\d\d:\d\d)$/.test(raw)
      ? 'instant'
      : 'unqualified';
  return recordingTimeSchema.parse({ kind, value: raw });
}

function add(
  group: HabitImportGroup,
  record: HistoricalCheckIn,
  row: number,
  index: Map<string, HistoricalCheckIn>,
) {
  if (
    record.value < 0 ||
    record.goal <= 0 ||
    record.note.length > 8000 ||
    !record.unit.trim() ||
    record.unit.length > 20
  ) {
    throw new Error('invalid_import_record');
  }
  if (
    group.kind === 'boolean' &&
    (record.goal !== 1 || (record.value !== 0 && record.value !== 1))
  ) {
    throw new Error('invalid_import_amount');
  }
  const key = JSON.stringify([group.key, record.date]);
  const previous = index.get(key);
  if (previous) {
    if (historicalCheckInIdentity(previous) !== historicalCheckInIdentity(record)) {
      throw new Error('duplicate_import_date');
    }
    group.warnings.push('duplicate_rows');
    return;
  }
  group.records.push(record);
  index.set(key, record);
  if (!record.recordedAt) {
    group.warnings.push('missing_recording_time');
  } else if (record.recordedAt.kind !== 'instant') {
    group.warnings.push('unknown_recording_timezone');
  }
  if (row > maximumImportRows + 4) {
    throw new Error('import_too_large');
  }
}

export function parseHabitFile(input: {
  bytes: ArrayBuffer;
  name: string;
  source: 'ticktick' | 'rillday';
}): HabitImportDraft {
  if (input.bytes.byteLength > maximumImportBytes) {
    throw new Error('import_too_large');
  }
  const csv = input.source === 'rillday';
  if (!(csv ? /\.csv$/i : /\.xlsx$/i).test(input.name)) {
    throw new Error('invalid_import_format');
  }
  const bytes = new Uint8Array(input.bytes);
  const workbook = csv
    ? XLSX.read(new TextDecoder('utf-8', { fatal: true }).decode(bytes), {
        type: 'string',
        raw: true,
      })
    : XLSX.read(bytes, {
        type: 'array',
        cellDates: false,
        cellHTML: false,
        cellFormula: true,
        cellNF: true,
        sheetRows: maximumImportRows + 5,
      });
  const groups: HabitImportGroup[] = [];
  const records = new Map<string, HistoricalCheckIn>();
  let count = 0;
  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) {
      throw new Error('invalid_import_format');
    }
    const fullRange: unknown = sheet['!fullref'];
    if (typeof fullRange === 'string') {
      const range = XLSX.utils.decode_range(fullRange);
      if (range.e.r > maximumImportRows + 3) {
        throw new Error('import_too_large');
      }
    }
    const visibleRange: unknown = sheet['!ref'];
    if (typeof visibleRange === 'string' && XLSX.utils.decode_range(visibleRange).e.c >= 16) {
      throw new Error('invalid_import_format');
    }
    for (const [key, cell] of Object.entries(sheet)) {
      if (!key.startsWith('!') && cell && typeof cell === 'object' && 'f' in cell) {
        throw new Error('import_formula_unsupported');
      }
    }
    const rows = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
      header: 1,
      raw: true,
      defval: '',
      blankrows: true,
    });
    count += Math.max(0, rows.length - (csv ? 1 : 3));
    if (count > maximumImportRows) {
      throw new Error('import_too_large');
    }
    if (csv) {
      const header = rows[0]?.map(text) ?? [];
      if (
        !csvHeaders.every((name) => header.includes(name)) ||
        new Set(header).size !== header.length
      ) {
        throw new Error('invalid_import_format');
      }

      const get = (row: unknown[], key: string) => row[header.indexOf(key)];

      for (const [index, row] of rows.slice(1).entries()) {
        if (row.every((cell) => text(cell) === '')) {
          continue;
        }
        const key = text(get(row, 'habit_key'));
        if (!key) {
          throw new Error('invalid_import_format');
        }
        let group = groups.find((g) => g.key === key);
        if (!group) {
          const kind = text(get(row, 'kind'));
          group = {
            key,
            name: text(get(row, 'habit_name')),
            ...(kind === 'boolean' || kind === 'quantity' ? { kind } : {}),
            goal: 0,
            unit: text(get(row, 'unit')),
            records: [],
            errors: [],
            warnings: ['history_rule_review', 'source_identity_unavailable'],
          };
          groups.push(group);
        }
        if (
          header.some((name) => ![...csvHeaders, 'skipped', 'recorded_at', 'note'].includes(name))
        ) {
          group.warnings.push('unsupported_columns');
        }
        try {
          const kind = text(get(row, 'kind'));
          if (kind !== 'boolean' && kind !== 'quantity') {
            throw new Error('invalid_import_kind');
          }
          if (
            group.name !== text(get(row, 'habit_name')) ||
            group.kind !== text(get(row, 'kind')) ||
            group.unit !== text(get(row, 'unit'))
          ) {
            throw new Error('inconsistent_import_habit');
          }
          const skipped = text(get(row, 'skipped'));
          if (skipped && skipped !== 'false' && skipped !== 'true') {
            throw new Error('invalid_import_status');
          }
          const time = recordedAt(get(row, 'recorded_at'));
          add(
            group,
            {
              date: date(get(row, 'date'), false),
              value: decimal(get(row, 'value')),
              goal: decimal(get(row, 'goal')),
              unit: group.unit,
              skipped: skipped === 'true',
              note: text(get(row, 'note')),
              ...(time ? { recordedAt: time } : {}),
            },
            index + 2,
            records,
          );
        } catch (error) {
          group.errors.push({
            row: index + 2,
            code: error instanceof Error ? error.message : 'invalid_import_record',
          });
        }
      }
    } else {
      const info = text(rows[0]?.[0]);
      if (
        !info.startsWith('Basic Information\n') ||
        rows[2]?.length !== tickTickHeaders.length ||
        !tickTickHeaders.every((h, i) => text(rows[2]?.[i]) === h)
      ) {
        throw new Error('invalid_import_format');
      }
      const metadata = new Map(
        info
          .split('\n')
          .slice(1)
          .map((line) => {
            const position = line.indexOf(':');
            return [line.slice(0, position), line.slice(position + 1).trim()];
          }),
      );
      const goal = metadata.get('Goal')?.match(/^(\d+(?:\.\d+)?) (.+)\/day$/);
      if (!goal?.[1] || !goal[2]) {
        throw new Error('invalid_import_goal');
      }
      const group: HabitImportGroup = {
        key: String(groups.length),
        name: metadata.get('Habit Name') ?? '',
        goal: decimal(goal[1]),
        unit: goal[2],
        ...(metadata.get('Frequency') === 'every day' ? { frequency: 'daily' as const } : {}),
        records: [],
        errors: [],
        warnings: [
          'history_rule_review',
          'historical_goals_unavailable',
          'appearance_not_imported',
          'source_identity_unavailable',
        ],
      };
      if (metadata.get('Habit Status') !== 'NORMAL') {
        group.errors.push({ row: 1, code: 'unsupported_ticktick_status' });
      }
      for (const [index, row] of rows.slice(3).entries()) {
        if (row.every((cell) => text(cell) === '')) {
          continue;
        }
        try {
          // Only the observed export profile is accepted. Unknown status semantics are never guessed.
          if (text(row[2]) !== 'Completed') {
            throw new Error('unsupported_ticktick_status');
          }
          const time = recordedAt(row[1]);
          const value = decimal(row[3]);
          if (value < group.goal) {
            throw new Error('inconsistent_import_status');
          }
          add(
            group,
            {
              date: date(row[0], Boolean(workbook.Workbook?.WBProps?.date1904)),
              value,
              goal: group.goal,
              unit: group.unit,
              skipped: false,
              note: text(row[5]),
              ...(time ? { recordedAt: time } : {}),
            },
            index + 4,
            records,
          );
          if (text(row[4])) {
            group.warnings.push('mood_not_imported');
          }
        } catch (error) {
          group.errors.push({
            row: index + 4,
            code: error instanceof Error ? error.message : 'invalid_import_record',
          });
        }
      }
      groups.push(group);
    }
  }
  if (!groups.length || groups.length > 100) {
    throw new Error('invalid_import_format');
  }
  for (const group of groups) {
    if (csv) {
      const latest = [...group.records]
        .sort((left, right) => left.date.localeCompare(right.date))
        .at(-1);
      if (latest) {
        group.goal = latest.goal;
      }
    }
    group.warnings = [...new Set(group.warnings)];
    if (!group.name.trim() || group.name.length > 120) {
      group.errors.push({ row: 1, code: 'invalid_import_name' });
    }
  }
  // Hash bytes without embedding private file content in the document or logs.
  return { fingerprint: hash(bytes), groups };
}
