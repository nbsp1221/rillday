import { randomBytes } from 'node:crypto';
import { once } from 'node:events';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createTask, createWorkspace, editTask, taskData } from '@repo/domain';
import { restoreDatabase } from '@repo/server/recovery';
import { createServer } from '@repo/server/runtime';
import {
  freePort,
  launchServer,
  removeOwned,
  setupAdministrator,
  tempDir,
} from '@repo/test-support';
import { produce } from 'immer';
import { expect, onTestFinished, test, vi } from 'vitest';
import { z } from 'zod';
import type { RemoteWorkspace } from '../../src/application/workspace/documents.ts';
import { ServerRequestError } from '../../src/application/server-transport.ts';
import { context, device, fixture, socketFor } from './support/native-workspaces.ts';

test.each([
  new ServerRequestError(503, 'server_unavailable'),
  new ServerRequestError(429, 'rate_limited'),
  new Error('invalid_response'),
])(
  'temporary authorization failure %s preserves edits and retries without login',
  async (failure) => {
    const server = await fixture({ label: 'native-transient-auth-' });
    onTestFinished(() => server.dispose());
    const account = await setupAdministrator(server.origin);
    const info = z
      .object({ serverId: z.string() })
      .parse(await (await fetch(server.origin + '/v1/server')).json());
    const disk = device();
    const workspace = createWorkspace(context);
    const initial = await disk.create(workspace);
    const id = initial.repository.id;
    await initial.repository.close();
    expect((await account.request('/v1/connection', { documentId: id })).status).toBe(200);
    const authorize = vi.fn().mockRejectedValue(failure);
    const remote = { url: server.origin, serverId: info.serverId, authorize };
    const current = await disk.open(id, remote);

    onTestFinished(() => current.repository.close());

    onTestFinished(() => current.synchronization?.close());

    await expect
      .poll(() => current.synchronization?.getSnapshot())
      .toMatchObject({
        state: 'error',
        error: failure.message,
      });
    const updated = produce(current.repository.getSnapshot().workspace, (draft) => {
      const entry = Object.keys(draft.lists)[0];
      expect.assert(entry !== undefined);
      createTask(draft, context.newId(), taskData(entry, 'Keep unsent input'), context);
    });
    await current.repository.commit(updated);
    authorize.mockResolvedValue(account.token);
    expect.assert(current.synchronization !== undefined);
    await current.synchronization.sync();

    expect(current.synchronization.getSnapshot().state).toBe('synced');
    const observer = await device().open(id, {
      ...remote,
      authorize: () => Promise.resolve(account.token),
    });

    onTestFinished(() => observer.repository.close());

    onTestFinished(() => observer.synchronization?.close());
    expect(
      Object.values(observer.repository.getSnapshot().workspace.tasks).map((task) => task.title),
    ).toEqual(['Keep unsent input']);
  },
);

test('the real server persists native sync, merges devices and accepts offline edits after an abrupt process death', async () => {
  const dir = tempDir('native-crash-');
  onTestFinished(() => removeOwned(dir));
  const options = {
    port: await freePort(),
    file: resolve(dir, 'data.sqlite'),
    entryPoint: fileURLToPath(import.meta.resolve('@repo/server/runtime')),
  };
  let server: ReturnType<typeof launchServer> | undefined;
  onTestFinished(() => server?.stop());
  server = launchServer(options);
  await server.ready;
  const account = await setupAdministrator(server.origin);
  const info = z
    .object({ serverId: z.string() })
    .parse(await (await fetch(server.origin + '/v1/server')).json());
  const remote: RemoteWorkspace = {
    url: server.origin,
    serverId: info.serverId,
    authorize: () => Promise.resolve(account.token),
  };
  const firstDevice = device();
  const secondDevice = device();
  const workspace = createWorkspace(context);
  const entry1 = Object.keys(workspace.lists)[0];
  expect.assert(entry1 !== undefined);
  const task = createTask(workspace, context.newId(), taskData(entry1, 'Review'), context);
  const initial = await firstDevice.create(workspace);
  onTestFinished(() => initial.repository.close());
  const id = initial.repository.id;
  await initial.repository.close();
  expect((await account.request('/v1/connection', { documentId: id })).status).toBe(200);
  const first = await firstDevice.open(id, remote);

  onTestFinished(() => first.synchronization?.close());
  onTestFinished(() => first.repository.close());
  expect.assert(first.synchronization !== undefined);
  await first.synchronization.sync();

  expect(first.synchronization.getSnapshot().state).toBe('synced');
  const second = await secondDevice.open(id, remote);

  onTestFinished(() => second.synchronization?.close());
  onTestFinished(() => second.repository.close());
  await Promise.all([
    first.repository.commit(
      produce(first.repository.getSnapshot().workspace, (draft) =>
        editTask(draft, task.id, { title: 'Reviewed on first device' }, context),
      ),
    ),
    second.repository.commit(
      produce(second.repository.getSnapshot().workspace, (draft) =>
        editTask(draft, task.id, { priority: 3 }, context),
      ),
    ),
  ]);

  expect.assert(second.synchronization !== undefined);
  await Promise.all([first.synchronization.sync(), second.synchronization.sync()]);
  // Server acknowledgment does not wait for delivery to the other device.
  await expect
    .poll(() => second.repository.getSnapshot().workspace.tasks[task.id])
    .toMatchObject({
      title: 'Reviewed on first device',
      priority: 3,
    });
  const died = once(server.child, 'exit');
  server.child.kill('SIGKILL');
  await died;

  await first.synchronization.close();
  await first.repository.close();

  await second.synchronization.close();
  await second.repository.close();
  const offline = await firstDevice.open(id);
  onTestFinished(() => offline.repository.close());
  await offline.repository.commit(
    produce(offline.repository.getSnapshot().workspace, (draft) =>
      editTask(draft, task.id, { notes: 'Written offline' }, context),
    ),
  );
  await offline.repository.close();
  server = launchServer(options);
  await server.ready;
  const reopened = await firstDevice.open(id, remote);

  onTestFinished(() => reopened.synchronization?.close());
  onTestFinished(() => reopened.repository.close());
  expect.assert(reopened.synchronization !== undefined);
  await reopened.synchronization.sync();
  const observer = await device().open(id, remote);

  onTestFinished(() => observer.synchronization?.close());
  onTestFinished(() => observer.repository.close());
  expect(observer.repository.getSnapshot().workspace.tasks[task.id]).toMatchObject({
    title: 'Reviewed on first device',
    priority: 3,
    notes: 'Written offline',
  });
});

test('a native heartbeat tick does not terminate a connection still obtaining its authentication token', async () => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
  onTestFinished(() => {
    vi.useRealTimers();
  });
  const server = await fixture();
  onTestFinished(() => server.dispose());
  const account = await setupAdministrator(server.origin);
  const document = await device().create(createWorkspace(context));
  onTestFinished(() => document.repository.close());
  await account.request('/v1/connection', { documentId: document.repository.id });
  const socket = socketFor(server.origin, document.repository.id);
  await once(socket, 'open');
  await vi.advanceTimersByTimeAsync(5000);
  expect(socket.readyState).toBe(WebSocket.OPEN);
  const authenticated = once(socket, 'message');
  socket.send(JSON.stringify({ type: 'authenticate', token: account.token }));
  const event = z.object({ data: z.string() }).parse((await authenticated)[0]);
  expect(JSON.parse(event.data)).toMatchObject({ type: 'authenticated' });
});

type SessionFixture = {
  server: Awaited<ReturnType<typeof fixture>>;
  account: Awaited<ReturnType<typeof setupAdministrator>>;
};

async function revokeSession({ account }: SessionFixture) {
  expect((await account.request('/api/auth/sign-out', {})).status).toBe(200);
}

const invalidSessions = [
  { status: 'revoked', invalidate: revokeSession },
  {
    status: 'expired',
    invalidate: ({ server, account }: SessionFixture) => {
      server.store
        .prepare('UPDATE session SET expiresAt=? WHERE userId=?')
        .run('2000-01-01T00:00:00.000Z', account.owner);
    },
  },
  {
    status: 'banned',
    invalidate: ({ server, account }: SessionFixture) => {
      server.store.prepare('UPDATE user SET banned=1 WHERE id=?').run(account.owner);
    },
  },
];

test.each(invalidSessions)(
  'an already authenticated native connection rejects further frames after its session becomes $status',
  async ({ invalidate }) => {
    const server = await fixture();
    onTestFinished(() => server.dispose());
    const account = await setupAdministrator(server.origin);
    const document = await device().create(createWorkspace(context));
    onTestFinished(() => document.repository.close());
    await account.request('/v1/connection', { documentId: document.repository.id });
    const socket = socketFor(server.origin, document.repository.id);
    await once(socket, 'open');
    const authenticated = once(socket, 'message');
    socket.send(JSON.stringify({ type: 'authenticate', token: account.token }));
    await authenticated;
    await Promise.resolve(invalidate({ server, account }));
    const closed = once(socket, 'close');
    socket.send(new Uint8Array([0]));
    expect(z.object({ code: z.number() }).parse((await closed)[0]).code).toBe(1008);
  },
);

test('a failed server write cannot acknowledge a large Unicode edit; native reconnect persists it without a custom retry journal', async () => {
  const server = await fixture();
  onTestFinished(() => server.dispose());
  const account = await setupAdministrator(server.origin);
  const documents = device();
  const workspace = createWorkspace(context);
  const entry2 = Object.keys(workspace.lists)[0];
  expect.assert(entry2 !== undefined);
  const task = createTask(
    workspace,
    context.newId(),
    taskData(entry2, 'Large Unicode notes'),
    context,
  );
  const initial = await documents.create(workspace);
  const id = initial.repository.id;
  onTestFinished(() => initial.repository.close());
  await initial.repository.close();
  await account.request('/v1/connection', { documentId: id });
  const document = await documents.open(id, {
    url: server.origin,
    serverId: z
      .object({ serverId: z.string() })
      .parse(await (await fetch(server.origin + '/v1/server')).json()).serverId,
    authorize: () => Promise.resolve(account.token),
  });

  onTestFinished(async () => {
    expect.assert(document.synchronization !== undefined);
    await document.synchronization.close();
    await document.repository.close();
  });
  expect.assert(document.synchronization !== undefined);
  await document.synchronization.sync();
  const entry3 = server.store
    .prepare<{ data: Uint8Array }>('SELECT data FROM workspace_documents WHERE owner=?')
    .get(account.owner);
  expect.assert(entry3 !== undefined);
  const saved = entry3.data;
  const notes = '東京都📚'.repeat(30000) + randomBytes(524288).toString('base64');
  expect(new TextEncoder().encode(notes).length).toBeGreaterThan(1024 * 1024);
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  onTestFinished(() => {
    vi.useRealTimers();
  });
  server.store.raw.pragma('query_only=ON');
  try {
    await document.repository.commit(
      produce(document.repository.getSnapshot().workspace, (draft) =>
        editTask(draft, task.id, { notes }, context),
      ),
    );

    await expect.poll(() => document.synchronization?.getSnapshot().state).toBe('offline');

    expect(document.synchronization.getSnapshot().pending).toBe(1);
    expect(
      server.store
        .prepare<{ data: Uint8Array }>('SELECT data FROM workspace_documents WHERE owner=?')
        .get(account.owner)?.data,
    ).toEqual(saved);
  } finally {
    server.store.raw.pragma('query_only=OFF');
  }
  // Exercise the SDK's five-second reconnect delay without waiting for wall time.
  await vi.advanceTimersByTimeAsync(5000);

  await document.synchronization.sync();
  const observer = await device().open(id, {
    url: server.origin,
    serverId: z
      .object({ serverId: z.string() })
      .parse(await (await fetch(server.origin + '/v1/server')).json()).serverId,
    authorize: () => Promise.resolve(account.token),
  });

  onTestFinished(async () => {
    expect.assert(observer.synchronization !== undefined);
    await observer.synchronization.close();
    await observer.repository.close();
  });
  expect(observer.repository.getSnapshot().workspace.tasks[task.id]?.notes).toBe(notes);
});

test('restoring a server backup preserves later device history and offline edits through native synchronization', async () => {
  const server = await fixture();
  onTestFinished(() => server.dispose());
  const directory = tempDir('native-history-restore-');
  onTestFinished(() => removeOwned(directory));
  const account = await setupAdministrator(server.origin);
  const serverId = z
    .object({ serverId: z.string() })
    .parse(await (await fetch(server.origin + '/v1/server')).json()).serverId;
  const remote: RemoteWorkspace = {
    url: server.origin,
    serverId,
    authorize: () => Promise.resolve(account.token),
  };
  const firstDevice = device();
  const secondDevice = device();
  const workspace = createWorkspace(context);
  const entry4 = Object.keys(workspace.lists)[0];
  expect.assert(entry4 !== undefined);
  const task = createTask(workspace, context.newId(), taskData(entry4, 'Backup point'), context);
  const initial = await firstDevice.create(workspace);
  onTestFinished(() => initial.repository.close());
  const id = initial.repository.id;
  await initial.repository.close();
  await account.request('/v1/connection', { documentId: id });
  const first = await firstDevice.open(id, remote);

  onTestFinished(async () => {
    expect.assert(first.synchronization !== undefined);
    await first.synchronization.close();
    await first.repository.close();
  });
  expect.assert(first.synchronization !== undefined);
  await first.synchronization.sync();
  const second = await secondDevice.open(id, remote);

  onTestFinished(async () => {
    expect.assert(second.synchronization !== undefined);
    await second.synchronization.close();
    await second.repository.close();
  });
  expect.assert(second.synchronization !== undefined);
  await second.synchronization.sync();

  await second.synchronization.close();
  await second.repository.close();
  const backup = resolve(directory, 'backup.sqlite');
  await server.store.raw.backup(backup);
  await first.repository.commit(
    produce(first.repository.getSnapshot().workspace, (draft) =>
      editTask(draft, task.id, { notes: 'Online change made after the backup' }, context),
    ),
  );

  await first.synchronization.sync();

  await first.synchronization.close();
  await first.repository.close();
  const offline = await secondDevice.open(id);
  onTestFinished(() => offline.repository.close());
  await offline.repository.commit(
    produce(offline.repository.getSnapshot().workspace, (draft) =>
      editTask(draft, task.id, { title: 'Offline change made after the backup' }, context),
    ),
  );
  await offline.repository.close();
  await server.close();
  const restored = await restoreDatabase(backup, resolve(directory, 'restored.sqlite'));
  const recovered = await createServer({
    file: restored,
    port: Number(new URL(server.origin).port),
    logger: false,
  });
  onTestFinished(() => recovered.close());
  const reconnected = await firstDevice.open(id, remote);

  onTestFinished(async () => {
    expect.assert(reconnected.synchronization !== undefined);
    await reconnected.synchronization.close();
    await reconnected.repository.close();
  });
  expect.assert(reconnected.synchronization !== undefined);
  await reconnected.synchronization.sync();
  const returning = await secondDevice.open(id, remote);

  onTestFinished(async () => {
    expect.assert(returning.synchronization !== undefined);
    await returning.synchronization.close();
    await returning.repository.close();
  });
  expect.assert(returning.synchronization !== undefined);
  await returning.synchronization.sync();
  const expected = {
    title: 'Offline change made after the backup',
    notes: 'Online change made after the backup',
  };
  await expect
    .poll(() => reconnected.repository.getSnapshot().workspace.tasks[task.id])
    .toMatchObject(expected);
  expect(returning.repository.getSnapshot().workspace.tasks[task.id]).toMatchObject(expected);
  expect(returning.repository.getSnapshot().decisions).toEqual([]);
});

test('archive replacement retains another device offline edits as durable review alternatives', async () => {
  const server = await fixture();
  onTestFinished(() => server.dispose());
  const account = await setupAdministrator(server.origin);
  const documents = device();
  const workspace = createWorkspace(context);
  const entry5 = Object.keys(workspace.lists)[0];
  expect.assert(entry5 !== undefined);
  const task = createTask(workspace, context.newId(), taskData(entry5, 'Archive point'), context);
  const initial = await documents.create(workspace);
  onTestFinished(() => initial.repository.close());
  const id = initial.repository.id;
  await initial.repository.close();
  await account.request('/v1/connection', { documentId: id });
  const serverId = z
    .object({ serverId: z.string() })
    .parse(await (await fetch(server.origin + '/v1/server')).json()).serverId;
  const remote: RemoteWorkspace = {
    url: server.origin,
    serverId,
    authorize: () => Promise.resolve(account.token),
  };
  const online = await documents.open(id, remote);

  onTestFinished(async () => {
    expect.assert(online.synchronization !== undefined);
    await online.synchronization.close();
    await online.repository.close();
  });
  expect.assert(online.synchronization !== undefined);
  await online.synchronization.sync();
  const archive = await online.exportData();
  const otherDevice = device();
  const other = await otherDevice.open(id, remote);

  onTestFinished(async () => {
    expect.assert(other.synchronization !== undefined);
    await other.synchronization.close();
    await other.repository.close();
  });
  expect.assert(other.synchronization !== undefined);
  await other.synchronization.sync();

  await other.synchronization.close();
  await other.repository.close();
  const offline = await otherDevice.open(id);
  onTestFinished(() => offline.repository.close());
  await offline.repository.commit(
    produce(offline.repository.getSnapshot().workspace, (draft) =>
      editTask(draft, task.id, { title: 'Offline title', notes: 'Offline authored note' }, context),
    ),
  );
  await offline.repository.close();
  await online.repository.commit(
    produce(online.repository.getSnapshot().workspace, (draft) =>
      editTask(draft, task.id, { title: 'Edited after export', notes: 'Online note' }, context),
    ),
  );

  await online.synchronization.sync();
  await online.replaceArchive(archive);

  await online.synchronization.sync();
  const returning = await otherDevice.open(id, remote);

  onTestFinished(async () => {
    expect.assert(returning.synchronization !== undefined);
    await returning.synchronization.close();
    await returning.repository.close();
  });
  expect.assert(returning.synchronization !== undefined);
  await returning.synchronization.sync();
  const choices = returning.repository
    .getSnapshot()
    .decisions.flatMap((decision) =>
      decision.choices.map((choice) => choice.workspace.tasks[task.id]),
    );

  expect(choices.some((task) => task?.title === 'Offline title')).toBe(true);

  expect(choices.some((task) => task?.notes === 'Offline authored note')).toBe(true);

  await returning.synchronization.close();
  await returning.repository.close();
  const reopened = await otherDevice.open(id);
  onTestFinished(() => reopened.repository.close());
  expect(reopened.repository.getSnapshot().decisions.length).toBeGreaterThan(0);
  expect(JSON.stringify(reopened.repository.getSnapshot().decisions)).toContain(
    'Offline authored note',
  );
});
