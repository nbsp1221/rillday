import { IDBFactory } from 'fake-indexeddb';
import { expect, onTestFinished, test, vi } from 'vitest';
import { createIndexedDbStorage, withWorkspaceLock } from '../adapters/browser/index.ts';
import { createFetchServerTransport } from '../adapters/http/server-transport.ts';
import { createApplication } from './application.ts';
import { createDemoApplication } from './demo-application.ts';
import { createTaskRecord } from './workspace/tasks.ts';

async function demoFixture(reset = true) {
  if (reset) {
    vi.stubGlobal('indexedDB', new IDBFactory());
  }
  const storage = createIndexedDbStorage({ demo: true, localOnly: true });
  const app = createDemoApplication({ storage, coordination: { withWorkspaceLock } });
  onTestFinished(() => app.dispose());
  await app.initialize();
  return { app, storage };
}

test('public demo rejects every server action before any request or credential session', async () => {
  const fetch = vi.fn(() => {
    throw new Error('Unexpected HTTP request');
  });
  vi.stubGlobal('fetch', fetch);
  const { app } = await demoFixture();
  const connection = app.getSnapshot().connection;
  expect(connection).toBe(app.connection);
  expect(connection.serverConnectionEnabled).toBe(false);
  expect(app.getSnapshot()).toBe(app.getSnapshot());
  const details = { email: 'demo@example.invalid', password: 'sample-password' };
  for (const operation of [
    () => connection.checkServer('https://server.example.invalid'),
    () => connection.setup(details),
    () => connection.login(details),
    () => connection.logout('keep'),
    () => connection.confirmConnection('include'),
    () => connection.cancelConnection(),
    () => connection.loadUsers(),
    () => connection.createUser(details),
    () => connection.setUserDisabled('example-user', true),
    () => connection.changePassword('before', 'after'),
  ]) {
    await expect(operation()).rejects.toThrow('demo_server_disabled');
  }
  expect(() => connection.prepareLogin()).toThrow('demo_server_disabled');
  expect(fetch).not.toHaveBeenCalled();
});

test('demo seed covers tasks, dates, repeating tasks, matrix and habits without replacing saved edits', async () => {
  const { app } = await demoFixture();
  const data = app.getSnapshot().workspace.getSnapshot().data;
  expect(data.tasks.some((task) => task.date && task.time)).toBe(true);
  expect(data.tasks.some((task) => task.repeat)).toBe(true);
  expect(data.tasks.some((task) => task.priority === 3)).toBe(true);
  expect(data.habits.length).toBeGreaterThan(0);
  const item = createTaskRecord('A browser-only edit', data)!;
  app.getSnapshot().workspace.apply({ type: 'task.create', tasks: [item] });
  await app.flushForExit();
  const second = await demoFixture(false);
  expect(
    second.app
      .getSnapshot()
      .workspace.getSnapshot()
      .data.tasks.some((task) => task.title === item.title),
  ).toBe(true);
});

test('reset uses the regular archive flow and leaves the normal browser workspace untouched', async () => {
  const { app } = await demoFixture();
  const normalStorage = createIndexedDbStorage();
  const normal = createApplication({
    transport: createFetchServerTransport(),
    storage: normalStorage,
    coordination: { withWorkspaceLock },
    credentials: {
      restore: () => Promise.resolve(null),
      remember: () => Promise.resolve(),
      forget: () => Promise.resolve(),
    },
  });
  onTestFinished(async () => {
    await normal.dispose();
    await normalStorage.accounts.close();
  });
  await normal.initialize();
  const ordinary = createTaskRecord(
    'Keep my normal workspace',
    normal.getSnapshot().workspace.getSnapshot().data,
  )!;
  normal.getSnapshot().workspace.apply({ type: 'task.create', tasks: [ordinary] });
  await normal.flushForExit();
  const item = createTaskRecord(
    'Replace this demo edit',
    app.getSnapshot().workspace.getSnapshot().data,
  )!;
  app.getSnapshot().workspace.apply({ type: 'task.create', tasks: [item] });
  await app.flushForExit();
  const before = app.getSnapshot().resetIdentity;
  await app.resetSampleData();
  expect(app.getSnapshot().resetIdentity).not.toBe(before);
  expect(
    app
      .getSnapshot()
      .workspace.getSnapshot()
      .data.tasks.some((task) => task.title === item.title),
  ).toBe(false);
  expect(
    normal
      .getSnapshot()
      .workspace.getSnapshot()
      .data.tasks.map((task) => task.title),
  ).toContain(ordinary.title);
});

test('a stored server binding and a direct remote document open are refused in demo mode', async () => {
  const { app, storage } = await demoFixture();
  const registry = await storage.accounts.readRegistry();
  const profile = registry.accounts[0];
  await expect(
    storage.documents.open(profile.contentId!, {
      url: 'https://server.example.invalid',
      serverId: 'example-server',
      authorize: () => Promise.resolve('never-used'),
    }),
  ).rejects.toThrow('demo_server_disabled');
  await app.dispose();
  const nextStorage = createIndexedDbStorage({ demo: true, localOnly: true });
  const saved = await nextStorage.accounts.loadRegistry();
  await nextStorage.accounts.saveRegistry({
    ...saved,
    accounts: saved.accounts.map((account) => ({
      ...account,
      server: {
        url: 'https://server.example.invalid',
        serverId: 'example-server',
        userId: 'example-user',
        email: 'demo@example.invalid',
        role: 'user',
      },
    })),
  });
  const next = createDemoApplication({ storage: nextStorage, coordination: { withWorkspaceLock } });
  onTestFinished(() => next.dispose());
  await expect(next.initialize()).rejects.toThrow('demo_server_disabled');
});
