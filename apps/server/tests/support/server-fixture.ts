import { createServerFixture } from '@repo/test-support';
import { test as base } from 'vitest';
import { createServer } from '../../src/server.ts';

export const fixture = createServerFixture(createServer);

export const test = base.extend('server', async ({}, { onCleanup }) => {
  const server = await fixture();
  onCleanup(() => server.dispose());
  return server;
});
