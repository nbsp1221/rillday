import { deleteDB } from 'idb';
import { test as base, expect, vi } from 'vitest';
import { BrowserWorkspaceRepository } from '../../src/adapters/browser/browser.ts';
import {
  createBrowserCredentialSession,
  createIndexedDbStorage,
  withWorkspaceLock,
} from '../../src/adapters/browser/index.ts';
import { createFetchServerTransport } from '../../src/adapters/http/server-transport.ts';
import { createApplication, createTaskRecord } from '../../src/application/index.ts';

const test = base.extend('host', ({}, { onCleanup }) => {
  const resources = new AsyncDisposableStack();
  onCleanup(async () => {
    await resources.disposeAsync();
    for (const database of await indexedDB.databases()) {
      if (database.name) {
        await deleteDB(database.name);
      }
    }
  });

  return {
    create() {
      const storage = createIndexedDbStorage();
      const application = createApplication({
        transport: createFetchServerTransport(),
        storage,
        coordination: { withWorkspaceLock },
        runtime: 'web',
        credentials: createBrowserCredentialSession(),
      });
      resources.defer(() => application.dispose());
      return { application, storage };
    },
  };
});

test('the injected local application saves and reopens without a server or DOM', async ({
  host,
}) => {
  using requests = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('No server exists'));
  using registryClose = vi.spyOn(BrowserWorkspaceRepository.prototype, 'close');
  const { application } = host.create();
  await application.initialize();
  const workspace = application.getSnapshot().workspace;
  const task = createTaskRecord('Keep this local task', workspace.getSnapshot().data);
  expect.assert(task);
  workspace.apply({ type: 'task.create', tasks: [task] });
  await application.preferences.savePreferences({ language: 'ko', density: 'compact' });
  await application.flushForExit();
  expect(workspace.getSnapshot().saveState).toBe('saved');
  expect(workspace.getSnapshot().syncState).toBe('local');
  await application.dispose();
  expect(registryClose).toHaveBeenCalledOnce();

  const reopened = host.create().application;
  await reopened.initialize();
  expect(reopened.getSnapshot().workspace.getSnapshot().data.tasks[0].title).toBe(
    'Keep this local task',
  );
  expect(await reopened.preferences.loadPreferences()).toMatchObject({
    language: 'ko',
    density: 'compact',
  });
  expect(requests).not.toHaveBeenCalled();
  expect(typeof document).toBe('undefined');
});

test('host exit receives a device-preference storage failure', async ({ host }) => {
  const { application, storage } = host.create();
  await application.initialize();
  using writes = vi
    .spyOn(storage.preferences, 'flushPreferences')
    .mockRejectedValueOnce(new DOMException('Synthetic quota failure', 'QuotaExceededError'));
  await expect(application.flushForExit()).rejects.toMatchObject({ name: 'QuotaExceededError' });
  expect(writes).toHaveBeenCalledOnce();
});

test('the application uses the injected storage and propagates its startup failure', async ({
  host,
}) => {
  const { application, storage } = host.create();
  using open = vi.spyOn(storage.documents, 'create').mockImplementation(() => {
    throw new Error('Synthetic storage unavailable');
  });
  await expect(application.initialize()).rejects.toThrow('Synthetic storage unavailable');
  expect(open).toHaveBeenCalledOnce();
});
