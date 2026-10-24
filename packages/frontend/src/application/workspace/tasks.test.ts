import { expect, test } from 'vitest';
import { createTaskRecord, emptyWorkspace, taskQuadrant } from './index.ts';

test('complex matrix includes tomorrow but excludes the day after tomorrow', () => {
  const data = emptyWorkspace();
  const important = createTaskRecord('Important', data, { priority: 2, date: '2026-10-17' });
  expect.assert(important);
  data.tasks.push(important);
  expect(taskQuadrant(important, '2026-10-16')).toStrictEqual({ important: true, urgent: true });

  const later = createTaskRecord('Later', data, { date: '2026-10-18' });
  expect.assert(later);
  data.tasks.push(later);
  expect(taskQuadrant(later, '2026-10-16').urgent).toBe(false);
});
