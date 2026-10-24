import { expect, test } from 'vitest';
import { withWorkspaceLock } from '../../src/adapters/browser/tab-coordination.ts';

test('short workspace locks allow readers together and release an exclusive transition after them', async ({
  onTestFinished,
}) => {
  const id = crypto.randomUUID();
  const events: string[] = [];
  const gate = Promise.withResolvers<void>();
  const operations: Promise<unknown>[] = [];
  onTestFinished(async () => {
    gate.resolve();
    await Promise.allSettled(operations);
  });
  const reader = withWorkspaceLock(
    id,
    () => {
      events.push('read');
      return gate.promise;
    },
    { mode: 'shared' },
  );
  operations.push(reader);
  await expect
    .poll(() => events, {
      timeout: 3000,
      interval: 10,
      message: 'first shared reader to acquire the lock',
    })
    .toHaveLength(1);
  const second = withWorkspaceLock(
    id,
    () => {
      events.push('second');
      return Promise.resolve();
    },
    { mode: 'shared' },
  );
  operations.push(second);
  await second;
  const transition = withWorkspaceLock(id, () => {
    events.push('transition');
    return Promise.resolve();
  });
  operations.push(transition);
  await expect
    .poll(async () =>
      (await navigator.locks.query()).pending?.some(
        (lock) => lock.name === `rillday-workspace:${id}:operation`,
      ),
    )
    .toBe(true);
  expect(events).toStrictEqual(['read', 'second']);
  gate.resolve();
  await Promise.all([reader, transition]);
  expect(events.at(-1)).toBe('transition');
});

test('cancelled lock requests do not run the protected action', async () => {
  const id = crypto.randomUUID();
  const controller = new AbortController();
  controller.abort();
  await expect(
    withWorkspaceLock(id, () => Promise.reject(new Error('Aborted work must not run')), {
      signal: controller.signal,
    }),
  ).rejects.toMatchObject({ name: 'AbortError' });
});
