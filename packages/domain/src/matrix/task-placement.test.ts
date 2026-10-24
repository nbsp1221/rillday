import { expect, test } from 'vitest';
import type { QuadrantData } from './quadrant.ts';
import { belongsToQuadrant, placeTaskInQuadrant } from './task-placement.ts';

const quadrants = [
  { key: 'do', important: true, urgent: true },
  { key: 'plan', important: true, urgent: false },
  { key: 'delegate', important: false, urgent: true },
  { key: 'later', important: false, urgent: false },
] satisfies Pick<QuadrantData, 'key' | 'important' | 'urgent'>[];

test.each(quadrants)('placing a task in $key makes it belong there in either mode', (quadrant) => {
  const today = '2026-10-31';
  for (const mode of ['simple', 'complex'] as const) {
    for (const date of [null, '2026-10-30', '2026-11-01', '2026-11-05']) {
      for (const priority of [0, 1, 2, 3] as const) {
        const task = { priority, date };
        const moved = { ...task, ...placeTaskInQuadrant(task, quadrant, mode, today) };
        expect(belongsToQuadrant(moved, quadrant, mode, today)).toBe(true);
        if (mode === 'simple') {
          expect(moved.date).toBe(date);
        }
      }
    }
  }
});

test('complex placement preserves an existing qualifying date and only changes urgency when needed', () => {
  const today = '2026-10-31';
  expect(
    placeTaskInQuadrant({ priority: 3, date: '2026-10-30' }, quadrants[0], 'complex', today),
  ).toEqual({ priority: 3, date: '2026-10-30' });
  expect(
    placeTaskInQuadrant({ priority: 3, date: '2026-10-30' }, quadrants[1], 'complex', today),
  ).toEqual({ priority: 3, date: '2026-11-02' });
  expect(placeTaskInQuadrant({ priority: 0, date: null }, quadrants[2], 'complex', today)).toEqual({
    priority: 0,
    date: today,
  });
});
