import { password, setupAdministrator } from '@repo/test-support';
import { expect, vi } from 'vitest';
import { test } from './support/server-fixture.ts';

test('password admission remains limited to two jobs while document requests remain responsive', async ({
  server: f,
}) => {
  const a = await setupAdministrator(f.origin);
  const releasePassword = Promise.withResolvers<void>();
  const handler = f.auth.handler.bind(f.auth);
  using passwordWork = vi.spyOn(f.auth, 'handler').mockImplementation(async (request) => {
    await releasePassword.promise;
    return handler(request);
  });
  let settled = 0;
  const requests = Array.from({ length: 8 }, () =>
    fetch(f.origin + '/api/auth/sign-in/email', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'origin': f.origin },
      body: JSON.stringify({ email: a.email, password }),
    }).then((response) => {
      settled++;
      return response;
    }),
  );

  try {
    await expect.poll(() => passwordWork.mock.calls.length).toBe(2);
    await expect.poll(() => settled).toBe(6);
    expect(passwordWork).toHaveBeenCalledTimes(2);

    const domain = await fetch(a.origin + '/v1/connection', {
      headers: {
        authorization: 'Bearer ' + a.token,
        origin: a.origin,
      },
      signal: AbortSignal.timeout(1000),
    });
    expect(domain.status).toBe(200);
    await domain.json();
    expect(settled).toBe(6);
  } finally {
    releasePassword.resolve();
    await Promise.allSettled(requests);
  }

  const results = await Promise.all(requests);
  for (const response of results) {
    expect([200, 503]).toContain(response.status);
  }
  expect(results.map((response) => response.status)).toContain(200);
  expect(results.map((response) => response.status)).toContain(503);
});
