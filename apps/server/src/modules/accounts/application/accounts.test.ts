import { expect, test, vi } from 'vitest';
import type {
  AccountAccess,
  AccountRegistration,
  AccountRepository,
  AccountSession,
} from './ports.ts';
import { AccountService } from './accounts.ts';

const input = {
  email: 'person@example.test',
  name: 'Person',
  password: 'Synthetic-password-2026!',
};
const administrator: AccountSession = {
  user: { id: 'admin', email: 'admin@example.test', name: 'Admin', role: 'admin' },
  expiresAt: new Date('2026-10-22T00:00:00Z'),
};

function dependencies() {
  const repository = {
    hasAdministrator: vi.fn(() => false),
    count: vi.fn(() => 1),
    list: vi.fn<AccountRepository['list']>(() => []),
    find: vi.fn<AccountRepository['find']>(() => ({ id: 'user', role: 'user' })),
  };
  const registration = {
    create: vi.fn<AccountRegistration['create']>().mockResolvedValue({ user: administrator.user }),
  };
  const access = {
    session: vi.fn<AccountAccess['session']>().mockResolvedValue(administrator),
    setDisabled: vi.fn<AccountAccess['setDisabled']>(),
  };
  return {
    repository,
    registration,
    access,
    service: new AccountService(repository, registration),
  };
}

test('account operations enforce authentication and administrator access without HTTP', async () => {
  const { service, access, repository, registration } = dependencies();
  for (const session of [
    null,
    { ...administrator, user: { ...administrator.user, role: 'user' } },
  ]) {
    access.session.mockResolvedValue(session);
    const fault = session ? 'administrator_required' : 'unauthenticated';
    await expect(service.list(access)).rejects.toMatchObject({ code: fault });
    await expect(service.create(access, input)).rejects.toMatchObject({ code: fault });
    await expect(service.setDisabled(access, 'user', true)).rejects.toMatchObject({ code: fault });
  }
  expect(repository.list).not.toHaveBeenCalled();
  expect(repository.count).not.toHaveBeenCalled();
  expect(repository.find).not.toHaveBeenCalled();
  expect(registration.create).not.toHaveBeenCalled();
  expect(access.setDisabled).not.toHaveBeenCalled();
});

test('current account returns only public fields and rejects missing sessions', async () => {
  const { service, access } = dependencies();
  expect(await service.current(access)).toStrictEqual(administrator);
  access.session.mockResolvedValue(null);
  await expect(service.current(access)).rejects.toMatchObject({
    code: 'unauthenticated',
  });
});

test('setup serializes attempts and releases admission after registration fails', async () => {
  const { service, registration } = dependencies();
  const pending = Promise.withResolvers<{ user: AccountSession['user'] }>();
  registration.create.mockReturnValueOnce(pending.promise);
  const first = service.setup(input);
  await expect(service.setup(input)).rejects.toMatchObject({ code: 'setup_complete' });
  const failure = new Error('Registration failed');
  const rejected = expect(first).rejects.toBe(failure);
  pending.reject(failure);
  await rejected;
  await service.setup(input);
  expect(registration.create).toHaveBeenCalledTimes(2);
  expect(registration.create).toHaveBeenLastCalledWith(input, 'admin');
});

test('setup translates a concurrent DB winner and refuses existing administrators', async () => {
  const { service, repository, registration } = dependencies();
  repository.hasAdministrator.mockReturnValueOnce(false).mockReturnValue(true);
  registration.create.mockRejectedValueOnce(new Error('Unique administrator'));
  await expect(service.setup(input)).rejects.toMatchObject({ code: 'setup_complete' });
  await expect(service.setup(input)).rejects.toMatchObject({ code: 'setup_complete' });
  expect(registration.create).toHaveBeenCalledOnce();
});

test('account ten is admitted as an ordinary user; account eleven is refused', async () => {
  const { service, repository, registration, access } = dependencies();
  repository.count.mockReturnValue(9);
  await service.create(access, input);
  expect(registration.create).toHaveBeenCalledWith(input, 'user');
  repository.count.mockReturnValue(10);
  await expect(service.create(access, input)).rejects.toMatchObject({
    code: 'account_capacity',
  });
  expect(registration.create).toHaveBeenCalledOnce();
  expect(service.configuration()).toMatchObject({ maxAccounts: 10 });
});

test('registration failure is reclassified only when a concurrent creation fills capacity', async () => {
  const { service, repository, registration, access } = dependencies();
  const failure = new Error('Registration failed');
  registration.create.mockRejectedValue(failure);
  await expect(service.create(access, input)).rejects.toBe(failure);
  repository.count.mockReturnValueOnce(9).mockReturnValue(10);
  await expect(service.create(access, input)).rejects.toMatchObject({ code: 'account_capacity' });
});

test('status changes protect administrators and missing accounts before invoking authentication', async () => {
  const { service, repository, access } = dependencies();
  repository.find
    .mockReturnValueOnce(undefined)
    .mockReturnValueOnce({ id: 'admin', role: 'admin' });
  await expect(service.setDisabled(access, 'missing', true)).rejects.toMatchObject({
    code: 'not_found',
  });
  await expect(service.setDisabled(access, 'admin', true)).rejects.toMatchObject({
    code: 'administrator_protected',
  });
  expect(access.setDisabled).not.toHaveBeenCalled();
  await expect(service.setDisabled(access, 'user', true)).resolves.toStrictEqual({ ok: true });
  await service.setDisabled(access, 'user', false);
  expect(access.setDisabled.mock.calls).toStrictEqual([
    ['user', true],
    ['user', false],
  ]);
});
