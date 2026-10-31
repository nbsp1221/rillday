import { expect, test } from 'vitest';
import { Store } from '../../../storage.ts';
import { createAuthentication } from './authentication.ts';

test('SDK registration shares the two-slot password budget and releases failed work', async ({
  onTestFinished,
}) => {
  const store = new Store(':memory:');
  onTestFinished(() => store.close());
  const authentication = await createAuthentication(store, {
    origin: 'http://localhost:4287',
    origins: ['http://localhost:4287'],
    secret: 'Synthetic-adapter-secret-at-least-32-characters',
  });
  const pending = Promise.withResolvers<void>();
  const first = authentication.passwordJob(() => pending.promise);
  const second = authentication.passwordJob(() => pending.promise);

  try {
    await expect(
      authentication.registration.create(
        {
          email: 'person@example.test',
          password: 'Synthetic-password-2026!',
        },
        'user',
      ),
    ).rejects.toMatchObject({ code: 'auth_busy', status: 503 });
    await expect(authentication.passwordJob(() => Promise.resolve())).rejects.toMatchObject({
      code: 'auth_busy',
    });
  } finally {
    pending.resolve();
    await Promise.all([first, second]);
  }

  const failure = new Error('Password operation failed');
  await expect(authentication.passwordJob(() => Promise.reject(failure))).rejects.toBe(failure);
  await expect(
    Promise.all([
      authentication.passwordJob(() => Promise.resolve('first')),
      authentication.passwordJob(() => Promise.resolve('second')),
    ]),
  ).resolves.toStrictEqual(['first', 'second']);

  const created = await authentication.registration.create(
    {
      email: 'Admin@Example.test',
      password: 'Synthetic-password-2026!',
    },
    'admin',
  );
  expect(created.user).toMatchObject({
    role: 'admin',
    email: 'admin@example.test',
    name: 'admin@example.test',
  });

  // The SDK may return a synthetic user for forbidden signups to avoid enumeration.
  await authentication.auth.api.signUpEmail({
    body: {
      email: 'rogue@example.test',
      name: 'Rogue',
      password: 'Synthetic-password-2026!',
    },
  });
  expect(store.prepare<{ count: number }>('SELECT count(*) count FROM user').get()?.count).toBe(1);
});
