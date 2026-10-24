import { expect, test, vi } from 'vitest';
import { registerCloseGuard } from './use-desktop-close-guard.ts';

function closeWindow() {
  let handler: ((event: { preventDefault(): void }) => void) | undefined;
  const destroyed = Promise.withResolvers<void>();
  const preventDefault = vi.fn();
  const window = {
    onCloseRequested: vi.fn((listener: typeof handler) => {
      handler = listener;
      return Promise.resolve(() => {
        handler = undefined;
      });
    }),
    destroy: vi.fn(() => {
      destroyed.resolve();
      return Promise.resolve();
    }),
  };
  return {
    window,
    destroyed: destroyed.promise,
    close: () => handler?.({ preventDefault }),
    preventDefault,
  };
}

test('desktop close waits for durable writes and coalesces repeated close requests', async () => {
  const native = closeWindow();
  const saved = Promise.withResolvers<void>();
  const save = vi.fn(() => saved.promise);
  const onError = vi.fn();
  const release = await registerCloseGuard(native.window, save, onError);
  native.close();
  native.close();
  expect(save).toHaveBeenCalledOnce();
  expect(native.preventDefault).toHaveBeenCalledTimes(2);
  expect(native.window.destroy).not.toHaveBeenCalled();

  saved.resolve();
  await native.destroyed;
  expect(native.window.destroy).toHaveBeenCalledOnce();
  expect(onError).not.toHaveBeenCalled();
  release();
  native.close();
  expect(save).toHaveBeenCalledOnce();
});

test('a failed durable write keeps the window open and permits a later close retry', async () => {
  const native = closeWindow();
  const failed = Promise.withResolvers<void>();
  const save = vi
    .fn<() => Promise<void>>()
    .mockRejectedValueOnce(new Error('Disk full'))
    .mockResolvedValue(undefined);
  await registerCloseGuard(native.window, save, () => failed.resolve());
  native.close();
  await failed.promise;
  expect(native.preventDefault).toHaveBeenCalledOnce();
  expect(native.window.destroy).not.toHaveBeenCalled();

  native.close();
  await native.destroyed;
  expect(save).toHaveBeenCalledTimes(2);
  expect(native.preventDefault).toHaveBeenCalledTimes(2);
  expect(native.window.destroy).toHaveBeenCalledOnce();
});

test('native listener registration errors propagate to startup instead of silently losing protection', async () => {
  const destroy = vi.fn();
  const onError = vi.fn();
  await expect(
    registerCloseGuard(
      {
        onCloseRequested: () => Promise.reject(new Error('Event permission denied')),
        destroy,
      },
      () => Promise.resolve(),
      onError,
    ),
  ).rejects.toMatchObject({ message: 'Event permission denied' });
  expect(destroy).not.toHaveBeenCalled();
  expect(onError).not.toHaveBeenCalled();
});
