import { expect, test } from 'vitest';
import { createTaskRecord, emptyWorkspace, parseQuickInput } from './index.ts';

test('Korean quick capture recognizes Unicode tags, date, time and priority', () => {
  const value = parseQuickInput('회의 자료 준비 #업무 #개발 내일 오후 3시 !1', '2026-10-16');
  expect(value.title).toBe('회의 자료 준비');
  expect(value.tags).toStrictEqual(['업무', '개발']);
  expect(value.date).toBe('2026-10-17');
  expect(value.time).toBe('15:00');
  expect(value.priority).toBe(3);
});

test('unknown dates and invalid times remain title text', () => {
  const value = parseQuickInput('Check 2026-02-30 13pm', '2026-10-16');
  expect(value.date).toBeNull();
  expect(value.time).toBeNull();
  expect(value.title).toMatch(/2026-02-30/);
  expect(value.title).toMatch(/13pm/);
});

test('metadata-only input cannot create an empty task', () => {
  expect(createTaskRecord('#tag tomorrow !1', emptyWorkspace())).toBeNull();
});

test('weekday parsing advances to the next matching weekday', () => {
  expect(parseQuickInput('Review monday', '2026-10-16').date).toBe('2026-10-19');
});

test('duplicate tags collapse and explicit no-priority is supported', () => {
  const p = parseQuickInput('organizing #work #work !4');
  expect(p.tags).toStrictEqual(['work']);
  expect(p.priority).toBe(0);
});

test('English quick capture supports the dates and times shown in the UI', () => {
  const parsed = parseQuickInput('Prepare slides #work tomorrow 3:30pm !2', '2026-10-16');
  expect(parsed.title).toBe('Prepare slides');
  expect(parsed.date).toBe('2026-10-17');
  expect(parsed.time).toBe('15:30');
  expect(parsed.priority).toBe(2);
  expect(parseQuickInput('Read monday 12am', '2026-10-16').date).toBe('2026-10-19');
  expect(parseQuickInput('Read monday 12am', '2026-10-16').time).toBe('00:00');
  expect(parseQuickInput('Call 13pm', '2026-10-16').time).toBeNull();
});

test.for([
  { input: 'Review 오늘', expected: { date: '2026-10-16' } },
  { input: 'Review 내일', expected: { date: '2026-10-17' } },
  { input: 'Review 모레', expected: { date: '2026-10-18' } },
  { input: 'Review 다음 주', expected: { date: '2026-10-23' } },
  { input: 'Review 월요일', expected: { date: '2026-10-19' } },
  { input: 'Review 매일', expected: { repeat: { frequency: 'daily' } } },
  { input: 'Review 매주', expected: { repeat: { frequency: 'weekly' } } },
  { input: 'Review 매월', expected: { repeat: { frequency: 'monthly' } } },
  { input: 'Review 평일마다', expected: { repeat: { frequency: 'weekdays' } } },
  { input: 'Review 오전 12시', expected: { time: '00:00' } },
  { input: 'Review 오후 12시', expected: { time: '12:00' } },
])('Korean date, recurrence and time recognition: $input', ({ input, expected }) => {
  expect(parseQuickInput(input, '2026-10-16')).toMatchObject({ title: 'Review', ...expected });
});

test('recognition preferences preserve user text while controlling extracted metadata', () => {
  const disabled = parseQuickInput('Review tomorrow 3pm #work', '2026-10-16', {
    recognizeDates: false,
    keepTagText: true,
  });
  expect(disabled.title).toBe('Review tomorrow 3pm #work');
  expect(disabled.date).toBeNull();
  expect(disabled.time).toBeNull();
  expect(disabled.tags).toStrictEqual(['work']);
  const retained = parseQuickInput('Review tomorrow 3pm #work', '2026-10-16', {
    removeDateText: false,
  });
  expect(retained.title).toBe('Review tomorrow 3pm');
  expect(retained.date).toBe('2026-10-17');
  expect(retained.time).toBe('15:00');
});
