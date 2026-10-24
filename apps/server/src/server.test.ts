import { once } from 'node:events';
import { createConnection } from 'node:net';
import { createServerFixture } from '@repo/test-support';
import { expect, onTestFinished, test } from 'vitest';
import { createServer } from './server.ts';

test('shutdown closes an accepted TCP connection that never sent an HTTP request', async () => {
  const server = await createServerFixture((options) =>
    createServer({ ...options, logger: false }),
  )();
  onTestFinished(() => server.dispose());
  const socket = createConnection(Number(new URL(server.origin).port), '127.0.0.1');
  onTestFinished(() => {
    socket.destroy();
  });
  await once(socket, 'connect');
  const closed = once(socket, 'close');
  await server.close();
  await closed;
  expect(socket.destroyed).toBe(true);
});
