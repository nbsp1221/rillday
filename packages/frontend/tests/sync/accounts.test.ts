import { ApiClient, createUser, password, setupAdministrator } from '@repo/test-support';
import { expect, onTestFinished, test, vi } from 'vitest';
import { WorkspaceSession } from '../../src/application/workspace-session.ts';
import { createTaskRecord } from '../../src/application/workspace/tasks.ts';
import { application, device, fixture } from './support/native-workspaces.ts';

test('restart opens local data and verifies server identity before restoring credentials', async () => {
  const server = await fixture();
  onTestFinished(() => server.dispose());
  const account = await setupAdministrator(server.origin);
  const first = application(account.token);
  await first.app.initialize();
  await first.app.connection.checkServer(server.origin);
  await first.app.connection.login({ email: account.email, password });
  const session = first.app.getSnapshot().workspace;
  const task = createTaskRecord('Available before authentication', session.getSnapshot().data);
  expect.assert(task !== null);
  session.apply({ type: 'task.create', tasks: [task] });
  await session.sync();
  await first.app.dispose();

  const fetch = globalThis.fetch;
  using request = vi.spyOn(globalThis, 'fetch').mockImplementation((input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (url.endsWith('/v1/server')) {
      return Promise.resolve(
        Response.json({
          product: 'Rillday',
          protocol: 1,
          serverId: crypto.randomUUID(),
          setupRequired: false,
          registration: 'administrator',
          maxAccounts: 10,
        }),
      );
    }
    return fetch(input, init);
  });
  const restarted = application(account.token, { reset: false });
  await restarted.app.initialize();
  expect(restarted.app.getSnapshot().workspace.getSnapshot().data.tasks[0]?.title).toBe(task.title);
  await expect
    .poll(() => restarted.app.getSnapshot().workspace.getSnapshot().error)
    .toBe('server_identity_changed');
  expect(restarted.credentials.restore).not.toHaveBeenCalled();
  expect(request.mock.calls.every(([, init]) => init?.credentials !== 'include')).toBe(true);
});

test('pending online authentication does not delay local startup or durable editing', async () => {
  const server = await fixture();
  onTestFinished(() => server.dispose());
  const account = await setupAdministrator(server.origin);
  const first = application(account.token);
  await first.app.initialize();
  await first.app.connection.checkServer(server.origin);
  await first.app.connection.login({ email: account.email, password });
  await first.app.getSnapshot().workspace.sync();
  await first.app.dispose();

  const authorization = Promise.withResolvers<string>();
  onTestFinished(() => authorization.resolve(account.token));
  const restarted = application(account.token, { reset: false });
  restarted.credentials.restore.mockReturnValueOnce(authorization.promise);
  await restarted.app.initialize();
  await expect.poll(() => restarted.credentials.restore.mock.calls.length).toBe(1);
  const session = restarted.app.getSnapshot().workspace;
  const task = createTaskRecord(
    'Edited before authentication completes',
    session.getSnapshot().data,
  );
  expect.assert(task !== null);
  session.apply({ type: 'task.create', tasks: [task] });
  await session.flush();
  expect(session.getSnapshot().saveState).toBe('saved');
  expect(session.getSnapshot().data.tasks[0]?.title).toBe(task.title);
  authorization.resolve(account.token);
  await session.sync();
  const registry = await restarted.storage.accounts.readRegistry();
  const profile = registry.accounts.find((profile) => profile.id === registry.activeId);
  expect.assert(profile !== undefined);
  expect.assert(profile.server !== undefined);
  expect.assert(profile.contentId !== undefined);
  const observer = await device().open(profile.contentId, {
    url: server.origin,
    serverId: profile.server.serverId,
    authorize: () => Promise.resolve(account.token),
  });

  onTestFinished(async () => {
    expect.assert(observer.synchronization !== undefined);
    await observer.synchronization.close();
    await observer.repository.close();
  });
  expect(observer.repository.getSnapshot().workspace.tasks[task.id]?.title).toBe(task.title);
});

test('a throwing host subscriber cannot close the committed replacement or leak its predecessor', async () => {
  const server = await fixture();
  onTestFinished(() => server.dispose());
  const account = await setupAdministrator(server.origin);
  const { app } = application(account.token);
  await app.initialize();
  await app.connection.checkServer(server.origin);
  await app.connection.login({ email: account.email, password });
  const previous = app.getSnapshot().workspace;
  expect.assert(previous instanceof WorkspaceSession);
  onTestFinished(() => previous.close());
  const close = vi.spyOn(previous, 'close');
  const unsubscribe = app.subscribe(() => {
    if (app.getSnapshot().workspace !== previous) {
      throw new Error('injected_host_publication_failure');
    }
  });
  onTestFinished(unsubscribe);
  await expect(app.connection.login({ email: account.email, password })).rejects.toThrow(
    'connection_cleanup_pending',
  );
  unsubscribe();
  const current = app.getSnapshot().workspace;
  expect(current).not.toBe(previous);
  expect(close).toHaveBeenCalledOnce();
  const task = createTaskRecord('Saved after publication failure', current.getSnapshot().data);
  expect.assert(task !== null);
  current.apply({ type: 'task.create', tasks: [task] });
  await current.sync();
  expect(current.getSnapshot().saveState).toBe('saved');
  expect(current.getSnapshot().data.tasks[0]?.title).toBe(task.title);
});

test.each(['publication', 'credential removal'])(
  'disconnect completes independent cleanup after a failure in %s',
  async (failure) => {
    const server = await fixture();
    onTestFinished(() => server.dispose());
    const account = await setupAdministrator(server.origin);
    const { app, storage, credentials } = application(account.token);
    await app.initialize();
    const local = app.getSnapshot().workspace;
    const createdTask = createTaskRecord('Saved before connecting', local.getSnapshot().data);
    expect.assert(createdTask !== null);
    local.apply({
      type: 'task.create',
      tasks: [createdTask],
    });
    await app.connection.checkServer(server.origin);
    await app.connection.login({ email: account.email, password });
    await app.connection.confirmConnection('include');
    await app.getSnapshot().workspace.sync();
    const connected = app.getSnapshot().workspace;
    await connected.importData(await connected.exportData());
    await app.getSnapshot().workspace.sync();
    const token: unknown = credentials.remember.mock.lastCall?.[1];
    expect.assert(typeof token === 'string');

    const registry = await storage.accounts.readRegistry();
    const source = registry.accounts.find((profile) => profile.id === registry.activeId);
    expect.assert(source !== undefined);
    expect(app.connection.getSnapshot().backups?.length).toBeGreaterThan(0);
    if (failure === 'credential removal') {
      credentials.forget.mockRejectedValueOnce(new Error('credential_store_unavailable'));
    }
    const unsubscribe = app.subscribe(() => {
      if (failure === 'publication' && app.getSnapshot().accounts[0]?.server === undefined) {
        throw new Error('injected_host_publication_failure');
      }
    });
    onTestFinished(unsubscribe);
    await expect(app.connection.logout('remove')).rejects.toThrow('connection_cleanup_pending');
    unsubscribe();
    expect(credentials.forget).toHaveBeenCalledOnce();
    expect((await new ApiClient(server.origin, token).request('/v1/connection')).status).toBe(401);
    expect.assert(source.contentId !== undefined);
    await expect(storage.documents.open(source.contentId)).rejects.toThrow('workspace_not_found');
    expect.assert(source.server !== undefined);
    expect(
      (
        await storage.accounts.connectionBackups(
          source.id,
          `${source.server.serverId}:${source.server.userId}`,
        )
      ).every((entry) => entry.localOnly),
    ).toBe(true);
    const disconnected = app.getSnapshot().accounts[0];
    expect.assert(disconnected !== undefined);
    expect(disconnected.server).toBeUndefined();
    const current = app.getSnapshot().workspace;
    expect(current.getSnapshot().syncState).toBe('local');
    const task = createTaskRecord('Saved after disconnect cleanup', current.getSnapshot().data);
    expect.assert(task !== null);
    current.apply({ type: 'task.create', tasks: [task] });
    await current.flush();
    expect(current.getSnapshot().saveState).toBe('saved');
  },
);

test('local archive replacement removes its predecessor and refreshes recovery even if a host subscriber throws', async () => {
  const { app, storage } = application('');
  await app.initialize();
  const previous = app.getSnapshot().workspace;
  const task = createTaskRecord('Restored from archive', previous.getSnapshot().data);
  expect.assert(task !== null);
  previous.apply({ type: 'task.create', tasks: [task] });
  const archive = await previous.exportData();
  previous.apply({ type: 'task.update', id: task.id, patch: { title: 'Before replacement' } });
  const source = (await storage.accounts.readRegistry()).accounts[0];
  expect.assert(source !== undefined);
  const unsubscribe = app.subscribe(() => {
    if (app.getSnapshot().workspace !== previous) {
      throw new Error('injected_host_publication_failure');
    }
  });
  onTestFinished(unsubscribe);
  await expect(previous.importData(archive)).rejects.toThrow('connection_cleanup_pending');
  unsubscribe();
  expect.assert(source.contentId !== undefined);
  await expect(storage.documents.open(source.contentId)).rejects.toThrow('workspace_not_found');
  expect(app.getSnapshot().workspace.getSnapshot().data.tasks[0]?.title).toBe(task.title);
  const backups = app.connection.getSnapshot().backups;
  expect.assert(backups !== undefined);
  const [backup] = backups;
  expect.assert(backup !== undefined);
  expect(backup).toBeDefined();
  expect(
    storage.documents.inspectArchive(await app.connection.downloadConnectionBackup(backup.id))
      .tasks[task.id]?.title,
  ).toBe('Before replacement');
});

test('a rejected disconnect keeps the connected session and removes the unused local copy', async () => {
  const server = await fixture();
  onTestFinished(() => server.dispose());
  const account = await setupAdministrator(server.origin);
  const { app, storage, credentials } = application(account.token);
  await app.initialize();
  await app.connection.checkServer(server.origin);
  await app.connection.login({ email: account.email, password });
  const previous = app.getSnapshot().workspace;
  const restore = storage.documents.restoreArchive.bind(storage.documents);
  let unused: string | undefined;
  using _restore = vi
    .spyOn(storage.documents, 'restoreArchive')
    .mockImplementation(async (source) => {
      const document = await restore(source);
      unused = document.repository.id;
      return document;
    });
  using _save = vi
    .spyOn(storage.accounts, 'saveRegistry')
    .mockRejectedValueOnce(new Error('injected_metadata_failure'));
  await expect(app.connection.logout('keep')).rejects.toThrow('injected_metadata_failure');
  expect(app.getSnapshot().workspace).toBe(previous);
  expect(credentials.forget).not.toHaveBeenCalled();
  expect(unused).toBeDefined();
  expect.assert(unused !== undefined);
  await expect(storage.documents.open(unused)).rejects.toThrow('workspace_not_found');
  const task = createTaskRecord('Connected after rejected disconnect', previous.getSnapshot().data);
  expect.assert(task !== null);
  previous.apply({ type: 'task.create', tasks: [task] });
  await previous.sync();
  expect(previous.getSnapshot().syncState).toBe('synced');
});

test('captured account input survives removal but stays private until that account reconnects', async () => {
  const server = await fixture();
  onTestFinished(() => server.dispose());
  const first = await setupAdministrator(server.origin);
  const second = await createUser(first);
  const { app, storage } = application(first.token);
  await app.initialize();
  await app.connection.checkServer(server.origin);
  await app.connection.login({ email: first.email, password });
  await app.getSnapshot().workspace.sync();
  await expect(app.connection.login({ email: second.email, password })).rejects.toThrow(
    'disconnect_first',
  );
  let drafts: [string, unknown][] = [['list:inbox', { text: 'Private first-account input' }]];
  const unbind = app.connection.registerDrafts(() => drafts);
  onTestFinished(unbind);
  const registry = await storage.accounts.readRegistry();
  const profile = registry.accounts[0];
  expect.assert(profile !== undefined);
  expect.assert(profile.server !== undefined);
  const scope = `${profile.server.serverId}:${profile.server.userId}`;
  await app.connection.logout('remove');
  drafts = [];
  const backup = (await storage.accounts.connectionBackups(profile.id, scope)).find(
    (entry) => entry.reason === 'draft',
  );
  expect.assert(backup !== undefined);
  expect(backup).toBeDefined();
  await expect(app.connection.downloadConnectionBackup(backup.id)).rejects.toThrow(
    'backup_missing',
  );
  await app.connection.checkServer(server.origin);
  await app.connection.login({ email: second.email, password });
  expect(app.connection.getSnapshot().backups?.some((entry) => entry.id === backup.id)).toBe(false);
  await expect(app.connection.downloadConnectionBackup(backup.id)).rejects.toThrow(
    'backup_missing',
  );
  expect(app.getSnapshot().workspace.getSnapshot().data.tasks).toEqual([]);
  await app.getSnapshot().workspace.sync();
  await app.connection.logout('remove');
  await app.connection.checkServer(server.origin);
  await app.connection.login({ email: first.email, password });
  expect(await app.connection.recoverInputs(backup.id)).toEqual([
    { key: 'list:inbox', text: 'Private first-account input' },
  ]);
});

test('renewed authentication retains offline changes in the same document and loading cannot clear revoked authentication', async () => {
  const server = await fixture();
  onTestFinished(() => server.dispose());
  const account = await setupAdministrator(server.origin);
  const initial = application(account.token);
  await initial.app.initialize();
  await initial.app.connection.checkServer(server.origin);
  await initial.app.connection.login({ email: account.email, password });
  const session = initial.app.getSnapshot().workspace;
  await session.sync();
  const profile = (await initial.storage.accounts.readRegistry()).accounts[0];
  expect.assert(profile !== undefined);
  const token: unknown = initial.credentials.remember.mock.lastCall?.[1];
  expect.assert(typeof token === 'string');

  expect((await new ApiClient(server.origin, token).request('/api/auth/sign-out', {})).status).toBe(
    200,
  );
  const task = createTaskRecord(
    'Offline edit after session revocation',
    session.getSnapshot().data,
  );
  expect.assert(task !== null);
  session.apply({ type: 'task.create', tasks: [task] });
  expect(session.getSnapshot().syncState).toBe('syncing');
  expect(session.getSnapshot().saveState).toBe('saving');
  await session.flush();
  await expect.poll(() => session.getSnapshot().syncState).toBe('authentication-required');
  await session.refresh();
  expect(session.getSnapshot().syncState).toBe('authentication-required');
  await expect(initial.app.connection.logout('remove')).rejects.toThrow('sync_before_remove');
  await initial.app.dispose();
  const restarted = application(token, { reset: false });
  await restarted.app.initialize();
  const offline = restarted.app.getSnapshot().workspace;
  expect(offline.getSnapshot().data.tasks[0]?.title).toBe(task.title);
  await expect(offline.sync()).rejects.toThrow('login_required');
  await offline.refresh();
  expect(offline.getSnapshot().syncState).toBe('authentication-required');
  await restarted.app.connection.checkServer(server.origin);
  await restarted.app.connection.login({ email: account.email, password });
  const renewed = restarted.app.getSnapshot().workspace;
  await renewed.sync();
  renewed.apply({ type: 'task.update', id: task.id, patch: { notes: 'Undo after reconnect' } });
  await renewed.sync();
  renewed.undo();
  await renewed.sync();
  expect((await restarted.storage.accounts.readRegistry()).accounts[0]?.contentId).toBe(
    profile.contentId,
  );
  expect.assert(profile.server !== undefined);
  expect.assert(profile.contentId !== undefined);
  const observer = await device().open(profile.contentId, {
    url: server.origin,
    serverId: profile.server.serverId,
    authorize: () => Promise.resolve(account.token),
  });

  onTestFinished(async () => {
    expect.assert(observer.synchronization !== undefined);
    await observer.synchronization.close();
    await observer.repository.close();
  });
  expect(observer.repository.getSnapshot().workspace.tasks[task.id]).toMatchObject({
    title: task.title,
    notes: '',
  });
  renewed.redo();
  await renewed.sync();
  await expect
    .poll(() => observer.repository.getSnapshot().workspace.tasks[task.id]?.notes)
    .toBe('Undo after reconnect');
});

test('a verified server address change retains the same document and saved edits', async () => {
  const server = await fixture();
  onTestFinished(() => server.dispose());
  const account = await setupAdministrator(server.origin);
  const { app, storage } = application(account.token);
  await app.initialize();
  await app.connection.checkServer(server.origin);
  await app.connection.login({ email: account.email, password });
  const session = app.getSnapshot().workspace;
  const task = createTaskRecord('Saved before changing address', session.getSnapshot().data);
  expect.assert(task !== null);
  session.apply({ type: 'task.create', tasks: [task] });
  await session.sync();
  const original = (await storage.accounts.readRegistry()).accounts[0];
  expect.assert(original !== undefined);
  const address = new URL(server.origin);
  address.hostname = 'localhost';
  await app.connection.checkServer(address.origin);
  await app.connection.login({ email: account.email, password });
  await app.getSnapshot().workspace.sync();
  const updated = (await storage.accounts.readRegistry()).accounts[0];
  expect.assert(updated !== undefined);
  expect(updated.contentId).toBe(original.contentId);
  expect.assert(original.server !== undefined);
  expect(updated.server).toMatchObject({
    url: address.origin,
    serverId: original.server.serverId,
    userId: original.server.userId,
  });
  expect(app.getSnapshot().workspace.getSnapshot().data.tasks[0]?.title).toBe(task.title);
});

test('follower binding adoption preserves captured input, and a backup failure leaves its predecessor usable', async () => {
  const server = await fixture();
  onTestFinished(() => server.dispose());
  const account = await setupAdministrator(server.origin);
  vi.stubGlobal('window', {});
  const first = application(account.token);
  await first.app.initialize();
  const original = first.app.getSnapshot().workspace;
  const task = createTaskRecord('Shared source', original.getSnapshot().data);
  expect.assert(task !== null);
  original.apply({ type: 'task.create', tasks: [task] });
  await original.flush();
  const follower = application(account.token, { reset: false });
  await follower.app.initialize();
  const predecessor = follower.app.getSnapshot().workspace;
  let drafts: [string, unknown][] = [['list:inbox', { text: 'Guest follower input' }]];
  const unbind = follower.app.connection.registerDrafts(() => drafts);
  onTestFinished(unbind);
  let failBackup = true;
  const saveBackup = follower.storage.accounts.saveConnectionBackup.bind(follower.storage.accounts);
  using _failure = vi
    .spyOn(follower.storage.accounts, 'saveConnectionBackup')
    .mockImplementation(async (...args) => {
      if (failBackup && args[2].reason === 'draft') {
        throw new Error('injected_input_backup_failure');
      }
      await saveBackup(...args);
    });
  await first.app.connection.checkServer(server.origin);
  await first.app.connection.login({ email: account.email, password });
  await first.app.connection.confirmConnection('include');
  await expect
    .poll(() => follower.app.connection.getSnapshot().error)
    .toBe('input_recovery_failed');
  expect(follower.app.getSnapshot().workspace).toBe(predecessor);
  predecessor.apply({
    type: 'task.update',
    id: task.id,
    patch: { notes: 'Still editable after failed adoption' },
  });
  await predecessor.flush();
  expect(predecessor.getSnapshot().saveState).toBe('saved');
  failBackup = false;
  await first.app.renameAccount(first.app.getSnapshot().activeId, 'Trigger registry adoption');
  await expect.poll(() => follower.app.getSnapshot().workspace !== predecessor).toBe(true);
  const guestBackup = follower.app.connection
    .getSnapshot()
    .backups?.find((entry) => entry.reason === 'draft');
  expect.assert(guestBackup !== undefined);
  expect(await follower.app.connection.recoverInputs(guestBackup.id)).toEqual([
    { key: 'list:inbox', text: 'Guest follower input' },
  ]);
  drafts = [['list:inbox', { text: 'Private connected follower input' }]];
  const profile = (await first.storage.accounts.readRegistry()).accounts[0];
  expect.assert(profile !== undefined);
  await first.app.getSnapshot().workspace.sync();
  await follower.app.getSnapshot().workspace.sync();
  await first.app.connection.logout('remove');
  await expect
    .poll(() => {
      const profile = follower.app.getSnapshot().accounts[0];
      expect.assert(profile !== undefined);
      return profile.server;
    })
    .toBeUndefined();
  drafts = [];
  expect.assert(profile.server !== undefined);
  const protectedBackup = (
    await follower.storage.accounts.connectionBackups(
      profile.id,
      `${profile.server.serverId}:${profile.server.userId}`,
    )
  ).find((entry) => entry.reason === 'draft' && !entry.localOnly);
  expect.assert(protectedBackup !== undefined);
  expect(protectedBackup).toBeDefined();
  await expect(
    follower.app.connection.downloadConnectionBackup(protectedBackup.id),
  ).rejects.toThrow('backup_missing');
  await first.app.connection.checkServer(server.origin);
  await first.app.connection.login({ email: account.email, password });
  await expect
    .poll(() =>
      follower.app.connection
        .getSnapshot()
        .backups?.some((entry) => entry.id === protectedBackup.id),
    )
    .toBe(true);
  expect(await follower.app.connection.recoverInputs(protectedBackup.id)).toEqual([
    { key: 'list:inbox', text: 'Private connected follower input' },
  ]);
});
