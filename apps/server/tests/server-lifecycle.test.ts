import { resolve } from 'node:path';
import { removeOwned, tempDir } from '@repo/test-support';
import { expect, test, vi } from 'vitest';
import { ServerLifecycle } from '../src/server-lifecycle.ts';
import { createServer } from '../src/server.ts';
import { Store } from '../src/storage.ts';

test('startup failure before an app exists releases the opened store', async () => {
  const close = vi.fn();
  const lifecycle = new ServerLifecycle({ close });
  const failure = new Error('Authentication migration failed');
  await expect(lifecycle.abort(failure)).rejects.toBe(failure);
  expect(close).toHaveBeenCalledOnce();
});

test('normal close and startup rollback share one idempotent runtime release', async () => {
  const close = vi.fn();
  const destroy = vi.fn().mockResolvedValue(undefined);
  const lifecycle = new ServerLifecycle({ close });
  lifecycle.sync = { close: destroy };
  lifecycle.app = { close: () => lifecycle.release() };
  const first = lifecycle.release();
  await Promise.all([first, lifecycle.release()]);
  await expect(lifecycle.abort(new Error('Listen failed'))).rejects.toThrow(/Listen failed/);
  expect(destroy).toHaveBeenCalledOnce();
  expect(close).toHaveBeenCalledOnce();
  expect(destroy).toHaveBeenCalledBefore(close);
});

test('cleanup failures do not skip the store or replace the original startup failure', async () => {
  const startupFailure = new Error('Listen failed');
  const poolFailure = new Error('Synchronization shutdown failed');
  const httpFailure = new Error('HTTP close failed');
  const close = vi.fn();
  const closeHttp = vi.fn().mockRejectedValue(httpFailure);
  const destroy = vi.fn().mockRejectedValue(poolFailure);
  const lifecycle = new ServerLifecycle({ close });
  lifecycle.app = { close: closeHttp };
  lifecycle.sync = { close: destroy };
  const aborted = lifecycle.abort(startupFailure);
  await expect(aborted).rejects.toBeInstanceOf(AggregateError);
  await expect(aborted).rejects.toMatchObject({
    errors: [startupFailure, httpFailure, expect.any(AggregateError)],
  });
  await expect(aborted).rejects.toHaveProperty(
    'errors.2.errors',
    expect.arrayContaining([poolFailure]),
  );
  expect(closeHttp).toHaveBeenCalledOnce();
  expect(destroy).toHaveBeenCalledOnce();
  expect(close).toHaveBeenCalledOnce();
  expect(closeHttp).toHaveBeenCalledBefore(destroy);
  expect(destroy).toHaveBeenCalledBefore(close);
});

test('document initialization failure closes the actual SQLite handle before createServer rejects', async ({
  onTestFinished,
}) => {
  const directory = tempDir('startup-failure-');
  onTestFinished(() => removeOwned(directory));
  vi.spyOn(Store.prototype, 'initialize').mockImplementation(() => {
    throw new Error('Document schema failed');
  });
  const close = vi.spyOn(Store.prototype, 'close');
  await expect(createServer({ file: resolve(directory, 'data.sqlite') })).rejects.toThrow(
    /Document schema failed/,
  );
  expect(close).toHaveBeenCalledOnce();
  const closed: unknown = close.mock.contexts[0];
  expect.assert(closed instanceof Store);
  expect(closed.raw.open).toBe(false);
});
