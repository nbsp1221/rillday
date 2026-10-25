import { createTask, createWorkspace, editTask, taskData } from '@repo/domain';
import { password, setupAdministrator } from '@repo/test-support';
import { produce } from 'immer';
import { expect, onTestFinished, test, vi } from 'vitest';
import { z } from 'zod';
import { createIndexedDbStorage, withWorkspaceLock } from '../../src/adapters/browser/index.ts';
import { createFetchServerTransport } from '../../src/adapters/http/server-transport.ts';
import { createApplication } from '../../src/application/application.ts';
import { createTaskRecord } from '../../src/application/workspace/tasks.ts';
import { application, context, device, fixture } from './support/native-workspaces.ts';

test('the application connects local data, restores an archive in the synced lineage and disconnects with a usable offline copy', async () => {
  const server = await fixture();
  onTestFinished(() => server.dispose());
  const account = await setupAdministrator(server.origin);
  const { app } = application(account.token);
  await app.initialize();
  let session = app.getSnapshot().workspace;
  const local = createTaskRecord('Local record', session.getSnapshot().data);
  expect.assert(local !== null);
  session.apply({ type: 'task.create', tasks: [local] });
  await app.connection.checkServer(server.origin);
  await app.connection.login({ email: account.email, password });
  expect(app.connection.getSnapshot().review?.local.tasks).toBe(1);
  await app.connection.confirmConnection('include');
  session = app.getSnapshot().workspace;
  await session.sync();
  const original = session.getSnapshot().data.tasks[0];
  expect.assert(original !== undefined);
  const archive = await session.exportData();
  const registered = (await account.request('/v1/connection')).body;
  session.apply({ type: 'task.update', id: original.id, patch: { title: 'Later edit' } });
  await session.sync();
  await session.importData(archive);
  session = app.getSnapshot().workspace;
  await session.sync();
  expect((await account.request('/v1/connection')).body).toEqual(registered);
  expect(session.getSnapshot().data.tasks[0]?.title).toBe('Local record');
  expect(session.getSnapshot().canUndo).toBe(false);
  expect(app.connection.getSnapshot().backups?.length).toBeGreaterThan(0);
  await app.connection.logout('keep');
  session = app.getSnapshot().workspace;
  expect(session.getSnapshot().syncState).toBe('local');
  session.apply({ type: 'task.update', id: original.id, patch: { title: 'Kept offline' } });
  await session.flush();
  expect(session.getSnapshot().data.tasks[0]?.title).toBe('Kept offline');
  expect(session.getSnapshot().saveState).toBe('saved');
});

test('a source edit arriving during credential persistence requires a new preview and leaves the local workspace active', async () => {
  const server = await fixture();
  onTestFinished(() => server.dispose());
  const account = await setupAdministrator(server.origin);
  const { app, credentials } = application(account.token);
  await app.initialize();
  const session = app.getSnapshot().workspace;
  const task = createTaskRecord('Reviewed', session.getSnapshot().data);
  expect.assert(task !== null);
  const identity = app.getSnapshot().resetIdentity;
  session.apply({ type: 'task.create', tasks: [task] });
  await app.connection.checkServer(server.origin);
  await app.connection.login({ email: account.email, password });
  credentials.remember.mockImplementationOnce(async () => {
    session.apply({
      type: 'task.update',
      id: task.id,
      patch: { title: 'Arrived during confirmation' },
    });
    await session.flush();
  });
  await expect(app.connection.confirmConnection('server-only')).rejects.toThrow(
    'connection_preview_changed',
  );
  expect(app.getSnapshot().resetIdentity).toBe(identity);
  const resumed = app.getSnapshot().workspace;
  expect(resumed.getSnapshot().data.tasks[0]?.title).toBe('Arrived during confirmation');
  expect(resumed.getSnapshot().syncState).toBe('local');
  await app.connection.confirmConnection('include');
  expect(app.getSnapshot().workspace.getSnapshot().data.tasks[0]?.title).toBe(
    'Arrived during confirmation',
  );
});

test('a failed final source save resumes the existing session and leaves its accepted edits retryable', async () => {
  const server = await fixture();
  onTestFinished(() => server.dispose());
  const account = await setupAdministrator(server.origin);
  const { app } = application(account.token);
  await app.initialize();
  const session = app.getSnapshot().workspace;
  const task = createTaskRecord('Keep editing', session.getSnapshot().data);
  expect.assert(task !== null);
  session.apply({ type: 'task.create', tasks: [task] });
  await app.connection.checkServer(server.origin);
  await app.connection.login({ email: account.email, password });
  const failure = new Error('disk_full');
  vi.spyOn(session, 'flush').mockResolvedValueOnce().mockRejectedValueOnce(failure);
  await expect(app.connection.confirmConnection('include')).rejects.toBe(failure);
  expect(app.getSnapshot().workspace).toBe(session);
  session.apply({ type: 'task.update', id: task.id, patch: { title: 'Still editable' } });
  await session.flush();
  expect(session.getSnapshot().data.tasks[0]?.title).toBe('Still editable');
  expect(session.getSnapshot().saveState).toBe('saved');
});

test('a late durable source edit is recoverable after restart without modifying the captured backup', async () => {
  const server = await fixture();
  onTestFinished(() => server.dispose());
  const account = await setupAdministrator(server.origin);
  const { app, storage, credentials } = application(account.token);
  await app.initialize();
  const session = app.getSnapshot().workspace;
  const task = createTaskRecord('Reviewed source', session.getSnapshot().data);
  expect.assert(task !== null);
  session.apply({ type: 'task.create', tasks: [task] });
  await session.flush();
  const account1 = (await storage.accounts.readRegistry()).accounts[0];
  expect.assert(account1 !== undefined);
  const sourceId = account1.contentId;
  await app.connection.checkServer(server.origin);
  await app.connection.login({ email: account.email, password });
  await app.connection.confirmConnection('server-only');
  const originals = app.connection.getSnapshot().backups;
  expect.assert(originals !== undefined);
  expect.assert(originals[0] !== undefined);
  const captured = await app.connection.downloadConnectionBackup(originals[0].id);
  expect.assert(sourceId !== undefined);
  const late = await storage.documents.open(sourceId);
  onTestFinished(() => late.repository.close());
  await late.repository.commit(
    produce(late.repository.getSnapshot().workspace, (draft) =>
      editTask(draft, task.id, { title: 'Saved after publication' }, context),
    ),
  );
  await late.repository.close();
  await app.dispose();
  const reopenedStorage = createIndexedDbStorage();
  const reopened = createApplication({
    transport: createFetchServerTransport(),
    storage: reopenedStorage,
    coordination: { withWorkspaceLock },
    credentials,
    runtime: 'web',
  });
  onTestFinished(() => reopened.dispose());
  await reopened.initialize();
  const recovery = reopened.connection
    .getSnapshot()
    .backups?.find((entry) => !originals.some((original) => original.id === entry.id));
  expect.assert(recovery !== undefined);
  expect(recovery).toBeDefined();
  const recovered = reopenedStorage.documents.inspectArchive(
    await reopened.connection.downloadConnectionBackup(recovery.id),
  );

  expect.assert(recovered.tasks[task.id] !== undefined);
  expect(recovered.tasks[task.id]?.title).toBe('Saved after publication');

  expect(await reopened.connection.downloadConnectionBackup(originals[0].id)).toBe(captured);
  expect(reopened.getSnapshot().workspace.getSnapshot().data.tasks).toEqual([]);
});

test('failed connection publication followed by a source edit retries one updated copy and preserves destination data', async () => {
  const server = await fixture();
  onTestFinished(() => server.dispose());
  const account = await setupAdministrator(server.origin);
  const documents = device();
  const workspace = createWorkspace(context);
  const existing = context.newId();
  const entry1 = Object.keys(workspace.lists)[0];
  expect.assert(entry1 !== undefined);
  createTask(workspace, existing, taskData(entry1, 'Unrelated destination data'), context);
  const seed = await documents.create(workspace);
  onTestFinished(() => seed.repository.close());
  const id = seed.repository.id;
  await seed.repository.close();
  await account.request('/v1/connection', { documentId: id });
  const serverId = z
    .object({ serverId: z.string() })
    .parse(await (await fetch(server.origin + '/v1/server')).json()).serverId;
  const destination = await documents.open(id, {
    url: server.origin,
    serverId,
    authorize: () => Promise.resolve(account.token),
  });

  onTestFinished(async () => {
    expect.assert(destination.synchronization !== undefined);
    await destination.synchronization.close();
    await destination.repository.close();
  });
  expect.assert(destination.synchronization !== undefined);
  await destination.synchronization.sync();
  const { app, storage } = application(account.token);
  await app.initialize();
  const local = app.getSnapshot().workspace;
  const task = createTaskRecord('Local source', local.getSnapshot().data);
  expect.assert(task !== null);
  local.apply({ type: 'task.create', tasks: [task] });
  await app.connection.checkServer(server.origin);
  await app.connection.login({ email: account.email, password });
  using _publication = vi
    .spyOn(storage.accounts, 'saveRegistry')
    .mockRejectedValueOnce(new Error('injected_metadata_failure'));
  await expect(app.connection.confirmConnection('include')).rejects.toThrow(
    'injected_metadata_failure',
  );
  expect(app.getSnapshot().workspace).toBe(local);
  local.apply({
    type: 'task.update',
    id: task.id,
    patch: { title: 'Updated source after failure' },
  });
  await local.flush();
  await expect(app.connection.confirmConnection('include')).rejects.toThrow(
    'connection_preview_changed',
  );
  await app.connection.confirmConnection('include');
  const current = app.getSnapshot().workspace;
  await current.sync();
  expect(
    current
      .getSnapshot()
      .data.tasks.map((task) => task.title)
      .sort(),
  ).toEqual(['Unrelated destination data', 'Updated source after failure']);
  expect(
    current.getSnapshot().data.tasks.find((task) => task.title === 'Unrelated destination data')
      ?.id,
  ).toBe(existing);
});

test('cancelling review retains later local edits and leaves the destination unchanged', async () => {
  const server = await fixture();
  onTestFinished(() => server.dispose());
  const account = await setupAdministrator(server.origin);
  const { app, storage } = application(account.token);
  await app.initialize();
  const local = app.getSnapshot().workspace;
  const task = createTaskRecord('Before review', local.getSnapshot().data);
  expect.assert(task !== null);
  local.apply({ type: 'task.create', tasks: [task] });
  await app.connection.checkServer(server.origin);
  await app.connection.login({ email: account.email, password });
  local.apply({ type: 'task.update', id: task.id, patch: { notes: 'Edited during review' } });
  await local.flush();
  await app.connection.cancelConnection();
  expect(app.getSnapshot().workspace).toBe(local);
  expect(local.getSnapshot().data.tasks[0]?.notes).toBe('Edited during review');
  expect(app.connection.getSnapshot().review).toBeNull();
  const disconnected = (await storage.accounts.readRegistry()).accounts[0];
  expect.assert(disconnected !== undefined);
  expect(disconnected.server).toBeUndefined();
  await app.connection.login({ email: account.email, password });
  expect(app.connection.getSnapshot().review?.remote.tasks).toBe(0);
  await app.connection.confirmConnection('include');
  await app.getSnapshot().workspace.sync();
  expect(app.getSnapshot().workspace.getSnapshot().data.tasks[0]?.notes).toBe(
    'Edited during review',
  );
});

test('shared-history inclusion exposes both valid offline alternatives in the committed session', async () => {
  const server = await fixture();
  onTestFinished(() => server.dispose());
  const account = await setupAdministrator(server.origin);
  const { app, storage } = application(account.token);
  await app.initialize();
  await app.connection.checkServer(server.origin);
  await app.connection.login({ email: account.email, password });
  const original = app.getSnapshot().workspace;
  const task = createTaskRecord('Shared history', original.getSnapshot().data);
  expect.assert(task !== null);
  original.apply({ type: 'task.create', tasks: [task] });
  await original.sync();
  const profile = (await storage.accounts.readRegistry()).accounts[0];
  expect.assert(profile !== undefined);
  await app.connection.logout('keep');
  const local = app.getSnapshot().workspace;
  local.apply({ type: 'task.update', id: task.id, patch: { title: 'Offline local alternative' } });
  await local.flush();
  expect.assert(profile.server !== undefined);
  expect.assert(profile.contentId !== undefined);
  const other = await device().open(profile.contentId, {
    url: server.origin,
    serverId: profile.server.serverId,
    authorize: () => Promise.resolve(account.token),
  });

  onTestFinished(async () => {
    expect.assert(other.synchronization !== undefined);
    await other.synchronization.close();
    await other.repository.close();
  });
  await other.repository.commit(
    produce(other.repository.getSnapshot().workspace, (draft) =>
      editTask(draft, task.id, { title: 'Online remote alternative' }, context),
    ),
  );
  expect.assert(other.synchronization !== undefined);
  await other.synchronization.sync();
  await app.connection.checkServer(server.origin);
  await app.connection.login({ email: account.email, password });
  await app.connection.confirmConnection('include');
  const current = app.getSnapshot().workspace;
  expect(current).not.toBe(local);
  expect(current.getSnapshot().syncState).toBe('conflict');
  const issue = current.getSnapshot().issues[0];
  expect.assert(issue !== undefined);
  const choices = JSON.stringify(issue.choices);
  expect(choices).toContain('Offline local alternative');
  expect(choices).toContain('Online remote alternative');
  expect(app.getSnapshot().accounts[0]?.server).toBeDefined();
});

test('reopening a committed binding before inclusion exposes the complete retained source archive', async () => {
  const server = await fixture();
  onTestFinished(() => server.dispose());
  const account = await setupAdministrator(server.origin);
  const { app, storage } = application(account.token);
  await app.initialize();
  const source = app.getSnapshot().workspace;
  const task = createTaskRecord(
    'Retained through interrupted inclusion',
    source.getSnapshot().data,
    { notes: 'Complete authored content' },
  );
  expect.assert(task !== null);
  source.apply({ type: 'task.create', tasks: [task] });
  await app.connection.checkServer(server.origin);
  await app.connection.login({ email: account.email, password });
  const save = storage.accounts.saveRegistry.bind(storage.accounts);
  using _interruption = vi
    .spyOn(storage.accounts, 'saveRegistry')
    .mockImplementationOnce(async (registry) => {
      await save(registry);
      throw new Error('injected_interruption_after_binding');
    });
  await expect(app.connection.confirmConnection('include')).rejects.toThrow(
    'injected_interruption_after_binding',
  );
  await app.dispose();
  const restarted = application(account.token, { reset: false });
  await restarted.app.initialize();
  expect(restarted.app.getSnapshot().accounts[0]?.server).toBeDefined();
  expect(restarted.app.getSnapshot().workspace.getSnapshot().data.tasks).toEqual([]);
  const backup = restarted.app.connection
    .getSnapshot()
    .backups?.find((entry) => entry.contents.tasks === 1);
  expect.assert(backup !== undefined);
  expect(backup).toBeDefined();
  const recovered = restarted.storage.documents.inspectArchive(
    await restarted.app.connection.downloadConnectionBackup(backup.id),
  );
  expect(recovered.tasks[task.id]).toMatchObject({ title: task.title, notes: task.notes });
});
