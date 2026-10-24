import { expect, test, vi } from 'vitest';
import { serverResponse, usersResponse } from '../../application/server-responses.ts';
import { ServerRequestError } from '../../application/server-transport.ts';
import { fetchServer, responseJson, verifyServerIdentity } from './server-transport.ts';

test('server discovery validates the protocol and administrator rows normalize SQLite booleans', () => {
  expect(
    serverResponse.safeParse({
      product: 'Other',
      protocol: 1,
      serverId: crypto.randomUUID(),
      setupRequired: false,
      registration: 'administrator',
      maxAccounts: 10,
    }).success,
  ).toBe(false);
  const user = { id: 'alice', email: 'alice@example.test', name: 'Alice', role: 'user' };
  expect(
    usersResponse
      .parse({
        users: [0, 1, false, true, null].map((banned) => ({ ...user, banned })),
      })
      .users.map((entry) => entry.banned),
  ).toStrictEqual([false, true, false, true, null]);
});

test('HTTP failures retain status and safe error codes; malformed successful responses are rejected', async () => {
  const rejected = responseJson(
    new Response(JSON.stringify({ error: 'resync_required' }), {
      status: 409,
    }),
  );
  await expect(rejected).rejects.toBeInstanceOf(ServerRequestError);
  await expect(rejected).rejects.toMatchObject({ status: 409, code: 'resync_required' });

  await expect(
    responseJson(
      new Response(JSON.stringify({ error: { unsafe: true } }), {
        status: 502,
      }),
    ),
  ).rejects.toMatchObject({ message: 'server_unavailable' });

  for (const [status, code] of [
    [401, 'request_failed'],
    [429, 'rate_limited'],
    [503, 'server_unavailable'],
  ] as const) {
    await expect(
      responseJson(new Response('<html>Proxy failure</html>', { status })),
    ).rejects.toMatchObject({ status, code });
  }

  await expect(responseJson(new Response('not JSON'))).rejects.toThrow('invalid_response');
});

test('transport failures retain their cause while local errors remain outside the transport boundary', async () => {
  using request = vi.spyOn(globalThis, 'fetch');
  const transport = new TypeError('Failed to fetch');
  const timeout = new DOMException('Timed out', 'TimeoutError');
  request.mockRejectedValueOnce(transport).mockRejectedValueOnce(timeout);
  await expect(fetchServer('https://example.test')).rejects.toMatchObject({
    status: 0,
    code: 'network_unavailable',
    cause: transport,
  });
  await expect(fetchServer('https://example.test')).rejects.toMatchObject({
    status: 0,
    code: 'request_timeout',
    cause: timeout,
  });
});

test('only valid mismatching server information signals an identity change', async () => {
  const id = crypto.randomUUID();
  const info = {
    product: 'Rillday',
    protocol: 1,
    serverId: id,
    setupRequired: false,
    registration: 'administrator',
    maxAccounts: 10,
  };
  await expect(verifyServerIdentity(Response.json(info), id)).resolves.toBeUndefined();
  await expect(verifyServerIdentity(Response.json(info), crypto.randomUUID())).rejects.toThrow(
    'server_identity_changed',
  );
  await expect(verifyServerIdentity(Response.json({}), id)).rejects.toThrow('invalid_response');
  await expect(
    verifyServerIdentity(new Response('Unavailable', { status: 503 }), id),
  ).rejects.toMatchObject({ status: 503 });
});
