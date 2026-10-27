import type { Application } from '@repo/frontend/application';
import { invoke } from '@tauri-apps/api/core';
import { beforeEach, expect, test, vi } from 'vitest';
import { desktopDataDirectory } from './data-directory';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
beforeEach(() => vi.resetAllMocks());

test('a failed save never switches the native data directory', async () => {
  const failure = new Error('save failed');
  const flushForExit = vi.fn().mockRejectedValue(failure);
  const directory = desktopDataDirectory({ flushForExit } as unknown as Application);
  await expect(directory.activate('selected')).rejects.toBe(failure);
  expect(invoke).not.toHaveBeenCalled();
});

test('native restart is requested only after durable saving finishes', async () => {
  const saved = Promise.withResolvers<void>();
  const directory = desktopDataDirectory({
    flushForExit: () => saved.promise,
  } as unknown as Application);
  const selecting = directory.activate('selected');
  expect(invoke).not.toHaveBeenCalled();
  saved.resolve();
  await selecting;
  expect(invoke).toHaveBeenCalledExactlyOnceWith('data_directory_use', { path: 'selected' });
});
