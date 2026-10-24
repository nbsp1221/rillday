import { resolve } from 'node:path';
import {
  ApiClient,
  authentication,
  createUser,
  password,
  serverSetup,
  setupAdministrator,
  signin,
} from '@repo/test-support';
import { expect } from 'vitest';
import { z } from 'zod';
import { resetPassword } from '../src/maintenance.ts';
import { documentFixture } from './support/document.ts';
import { test } from './support/server-fixture.ts';

test('filesystem password recovery revokes every session and preserves account role and private data', async ({
  server: f,
}) => {
  const admin = await setupAdministrator(f.origin);
  const other = await signin(admin);
  const document = documentFixture({
    title: 'Private recovery record',
    notes: 'Only this account may read this content.',
  });
  expect((await admin.request('/v1/connection', { documentId: document.documentId })).status).toBe(
    200,
  );
  f.store
    .prepare('UPDATE workspace_documents SET data=? WHERE owner=?')
    .run(document.binary, admin.owner);

  const replacement = 'Replacement-only-password-2026!';
  await resetPassword(resolve(f.dir, 'data.sqlite'), admin.email, replacement);
  expect((await admin.request('/v1/account')).status).toBe(401);
  expect((await other.request('/v1/account')).status).toBe(401);
  const response = await fetch(f.origin + '/api/auth/sign-in/email', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'origin': f.origin },
    body: JSON.stringify({ email: admin.email, password: replacement }),
  });
  expect(response.status).toBe(200);
  const body: unknown = await response.json();
  expect(body).toHaveProperty('user.role', 'admin');
  const login = authentication.parse(body);
  const recovered = new ApiClient(f.origin, login.token);
  expect((await recovered.request('/v1/account')).body).toHaveProperty('user.id', admin.owner);
  expect((await recovered.request('/v1/connection')).body).toEqual({
    documentId: document.documentId,
  });
  const saved = f.store
    .prepare<{ data: Uint8Array }>('SELECT data FROM workspace_documents WHERE owner=?')
    .get(admin.owner);
  expect(saved?.data).toEqual(Buffer.from(document.binary));

  await expect(createUser(admin)).rejects.toThrow('unauthenticated');
  const provisioned = await createUser(recovered);
  expect(provisioned.owner).not.toBe(admin.owner);
  expect((await provisioned.request('/v1/account')).body).toMatchObject({
    user: { role: 'user' },
  });

  await expect(
    resetPassword(resolve(f.dir, 'data.sqlite'), admin.email, 'short'),
  ).rejects.toThrow();
});

test('first administrator is atomic; public registration and role escalation stay closed', async ({
  server: f,
}) => {
  const setup = (email: string) =>
    fetch(f.origin + '/v1/setup', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'origin': f.origin },
      body: JSON.stringify({ email, name: 'Administrator', password }),
    });

  const responses = await Promise.all([setup('first@rillday.test'), setup('second@rillday.test')]);
  expect(responses.map((r) => r.status).sort((left, right) => left - right)).toStrictEqual([
    201, 409,
  ]);
  expect(serverSetup.parse(await (await fetch(f.origin + '/v1/server')).json()).setupRequired).toBe(
    false,
  );
  expect(
    (
      await fetch(f.origin + '/api/auth/sign-up/email', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'rogue@rillday.test', name: 'Rogue', password }),
      })
    ).status,
  ).toBe(404);
  const email = responses[0].status === 201 ? 'first@rillday.test' : 'second@rillday.test';
  const login = authentication.parse(
    await (
      await fetch(f.origin + '/api/auth/sign-in/email', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'origin': f.origin },
        body: JSON.stringify({ email, password }),
      })
    ).json(),
  );
  const headers = {
    'content-type': 'application/json',
    'authorization': 'Bearer ' + login.token,
    'origin': f.origin,
  };
  expect(
    (
      await fetch(f.origin + '/api/auth/update-user', {
        method: 'POST',
        headers,
        body: JSON.stringify({ role: 'user' }),
      })
    ).status,
  ).toBe(400);
  expect(
    (
      await fetch(f.origin + '/api/auth/admin/impersonate-user', {
        method: 'POST',
        headers,
        body: '{}',
      })
    ).status,
  ).toBe(404);
  expect(
    (
      await fetch(f.origin + '/v1/admin/users', {
        headers: { ...headers, origin: 'https://untrusted.invalid' },
      })
    ).status,
  ).toBe(403);

  const administrator = new ApiClient(f.origin, login.token);
  await expect(setupAdministrator(f.origin)).rejects.toThrow('setup_complete');
  const provisioned = await createUser(administrator);
  expect((await provisioned.request('/v1/account')).body).toMatchObject({
    user: { role: 'user' },
  });
});

test('administrator provisions ordinary accounts without data access or impersonation; disabling revokes sessions', async ({
  server: f,
}) => {
  const admin = await setupAdministrator(f.origin);
  const user = await createUser(admin);
  const second = await signin(user);
  await expect(createUser(user)).rejects.toThrow('administrator_required');
  expect((await user.request('/v1/admin/users')).status).toBe(403);
  expect(
    (await admin.request('/v1/admin/users/' + user.owner + '/status', { disabled: true })).status,
  ).toBe(200);
  expect((await user.request('/v1/account')).status).toBe(401);
  expect((await second.request('/v1/connection')).status).toBe(401);
  expect(
    (await admin.request('/v1/admin/users/' + admin.owner + '/status', { disabled: true })).status,
  ).toBe(409);
  expect(
    (await admin.request('/v1/admin/users/' + user.owner + '/status', { disabled: false })).status,
  ).toBe(200);
  await signin(user);
  const account = (await admin.request('/v1/account')).body;
  expect(account).toHaveProperty('user.role', 'admin');
});

test('account HTTP contracts retain cookies, public projections, origin checks and input validation', async ({
  server: f,
}) => {
  const info = z
    .object({ serverId: z.string() })
    .passthrough()
    .parse(await (await fetch(f.origin + '/v1/server')).json());
  expect(info).toMatchObject({
    product: 'Rillday',
    protocol: 1,
    setupRequired: true,
    registration: 'administrator',
    maxAccounts: 10,
  });
  const admin = await setupAdministrator(f.origin);
  const login = await fetch(f.origin + '/api/auth/sign-in/email', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'origin': f.origin },
    body: JSON.stringify({ email: admin.email, password }),
  });
  expect(login.status).toBe(200);
  const cookie = login.headers
    .getSetCookie()
    .map((value) => value.split(';')[0])
    .join('; ');
  expect(cookie).not.toBe('');
  const account = await fetch(f.origin + '/v1/account', { headers: { cookie } });
  expect(account.status).toBe(200);
  const current = z
    .object({ expiresAt: z.string() })
    .passthrough()
    .parse(await account.json());
  expect(current).toStrictEqual({
    user: { id: admin.owner, email: admin.email, name: 'Synthetic account', role: 'admin' },
    expiresAt: current.expiresAt,
  });
  expect((await fetch(f.origin + '/v1/admin/users')).status).toBe(401);
  expect(
    (await admin.request('/v1/admin/users', { email: 'bad', name: '', password: 'short' })).status,
  ).toBe(400);
  expect(
    (
      await admin.request('/v1/admin/users', {
        email: 'extra@example.test',
        name: 'Extra',
        password,
        role: 'admin',
      })
    ).status,
  ).toBe(400);
  expect((await admin.request('/v1/admin/users/missing/status', { disabled: true })).status).toBe(
    404,
  );
  expect(
    (
      await fetch(f.origin + '/v1/account', {
        headers: { cookie, origin: 'https://untrusted.invalid' },
      })
    ).status,
  ).toBe(403);
  const initializedInfo: unknown = await (await fetch(f.origin + '/v1/server')).json();
  expect(initializedInfo).toMatchObject({
    serverId: info.serverId,
    setupRequired: false,
  });
});

test('SQLite still rejects a second administrator and an eleventh account outside the application', async ({
  server: f,
}) => {
  const admin = await setupAdministrator(f.origin);
  const insert = f.store.prepare(`
    INSERT INTO user (id,name,email,emailVerified,createdAt,updatedAt,role)
    SELECT ?,name,?,emailVerified,createdAt,updatedAt,? FROM user WHERE id=?
  `);
  expect(() =>
    insert.run(crypto.randomUUID(), 'second-admin@example.test', 'admin', admin.owner),
  ).toThrow(/UNIQUE constraint failed/);
  for (let index = 1; index < 10; index++) {
    insert.run(`user-${index}`, `user-${index}@example.test`, 'user', admin.owner);
  }
  expect((await admin.request('/v1/admin/users/user-1/status', { disabled: true })).status).toBe(
    200,
  );
  expect(() => insert.run('eleventh', 'eleventh@example.test', 'user', admin.owner)).toThrow(
    'account_capacity',
  );
  const listing = z
    .object({ users: z.array(z.unknown()) })
    .parse((await admin.request('/v1/admin/users')).body);
  expect(listing.users).toHaveLength(10);
  expect(listing.users).toContainEqual({
    id: 'user-1',
    email: 'user-1@example.test',
    name: 'Synthetic account',
    role: 'user',
    banned: 1,
  });
  expect(
    (
      await admin.request('/v1/admin/users', {
        email: 'overflow@example.test',
        name: 'Overflow',
        password,
      })
    ).status,
  ).toBe(409);
});

test('failed local recovery preserves sessions when the credential record is missing', async ({
  server: f,
}) => {
  const admin = await setupAdministrator(f.origin);
  f.store.prepare('DELETE FROM account WHERE userId=?').run(admin.owner);
  await expect(
    resetPassword(
      resolve(f.dir, 'data.sqlite'),
      ' ' + admin.email.toUpperCase() + ' ',
      'Replacement-password-2026!',
    ),
  ).rejects.toThrow('Password account not found');
  expect((await admin.request('/v1/account')).status).toBe(200);
});
