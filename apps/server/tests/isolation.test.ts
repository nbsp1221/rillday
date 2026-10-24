import { once } from 'node:events';
import { cbor } from '@automerge/automerge-repo';
import { createUser, password, setupAdministrator } from '@repo/test-support';
import { expect } from 'vitest';
import { WebSocket } from 'ws';
import { documentFixture } from './support/document.ts';
import { test } from './support/server-fixture.ts';

test('ten private accounts own isolated native documents; an eleventh account is refused', async ({
  server,
}) => {
  const administrator = await setupAdministrator(server.origin);
  const accounts = [administrator];
  for (let index = 1; index < 10; index++) {
    accounts.push(await createUser(administrator));
  }
  const sharedId = crypto.randomUUID();
  const documents = accounts.map((_, index) =>
    documentFixture({ id: sharedId, content: 'owner-' + index }),
  );
  for (const [index, account] of accounts.entries()) {
    const document = documents[index];
    expect(
      (await account.request('/v1/connection', { documentId: document.documentId })).status,
    ).toBe(200);
    server.store
      .prepare('UPDATE workspace_documents SET data=? WHERE owner=?')
      .run(document.binary, account.owner);
  }
  for (const [index, account] of accounts.entries()) {
    expect(
      (await account.request('/v1/connection?owner=' + accounts[(index + 1) % 10].owner)).body,
    ).toEqual({ documentId: documents[index].documentId });
    const row = server.store
      .prepare<{ data: Uint8Array }>('SELECT data FROM workspace_documents WHERE owner=?')
      .get(account.owner);
    expect(row?.data).toEqual(Buffer.from(documents[index].binary));
  }
  expect(new Set(accounts.map((account) => account.owner)).size).toBe(10);
  const overflow = await administrator.request('/v1/admin/users', {
    email: 'eleventh@rillday.test',
    password,
    name: 'Synthetic overflow',
  });
  expect(overflow.status).toBe(409);
  expect(server.store.prepare<{ n: number }>('SELECT count(*) n FROM user').get()?.n).toBe(10);
});

test('HTTP registration and native sockets reject other owners and cross-document frames', async ({
  server,
  onTestFinished,
}) => {
  const administrator = await setupAdministrator(server.origin);
  const owner = await createUser(administrator);
  const privateDocument = documentFixture({ title: 'Private account data' });
  expect(
    (await owner.request('/v1/connection', { documentId: privateDocument.documentId })).status,
  ).toBe(200);
  server.store
    .prepare('UPDATE workspace_documents SET data=? WHERE owner=?')
    .run(privateDocument.binary, owner.owner);
  expect(
    (await administrator.request('/v1/connection', { documentId: privateDocument.documentId }))
      .status,
  ).toBe(409);
  expect((await administrator.request('/v1/connection')).body).toEqual({ documentId: null });
  expect((await fetch(server.origin + '/v1/connection')).status).toBe(401);
  expect(
    (await owner.request('/v1/connection', undefined, { origin: 'https://untrusted.invalid' }))
      .status,
  ).toBe(403);
  expect(() =>
    server.store
      .prepare('INSERT INTO workspace_documents(owner,documentId) VALUES(?,?)')
      .run('missing-owner', documentFixture({}).documentId),
  ).toThrow(/FOREIGN KEY/);

  const wrongOwner = new WebSocket(
    server.origin.replace('http:', 'ws:') + '/v1/workspace/' + privateDocument.documentId,
  );
  onTestFinished(() => wrongOwner.terminate());
  const leaked: unknown[] = [];
  wrongOwner.on('message', (data) => leaked.push(data));
  await once(wrongOwner, 'open');
  const refused = once(wrongOwner, 'close');
  wrongOwner.send(JSON.stringify({ type: 'authenticate', token: administrator.token }));
  expect((await refused)[0]).toBe(1008);
  expect(leaked).toEqual([]);

  const socket = new WebSocket(
    server.origin.replace('http:', 'ws:') + '/v1/workspace/' + privateDocument.documentId,
  );
  onTestFinished(() => socket.terminate());
  await once(socket, 'open');
  const authenticated = once(socket, 'message');
  socket.send(JSON.stringify({ type: 'authenticate', token: owner.token }));
  expect(String((await authenticated)[0])).toContain('authenticated');
  const closed = once(socket, 'close');
  socket.send(
    cbor.encode({
      type: 'request',
      senderId: 'untrusted-peer',
      documentId: documentFixture({}).documentId,
    }),
  );
  expect((await closed)[0]).toBe(1008);
  const saved = server.store
    .prepare<{ data: Uint8Array }>('SELECT data FROM workspace_documents WHERE owner=?')
    .get(owner.owner);
  expect(saved?.data).toEqual(Buffer.from(privateDocument.binary));
});
