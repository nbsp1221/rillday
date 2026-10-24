import { expect, test, vi } from 'vitest';
import type { PasswordRecoveryRepository } from './ports.ts';
import { recoverAccountPassword } from './recover-password.ts';

function dependencies() {
  return {
    repository: {
      findByEmail: vi.fn<PasswordRecoveryRepository['findByEmail']>(() => ({ id: 'user' })),
      replaceCredentialAndRevokeSessions:
        vi.fn<PasswordRecoveryRepository['replaceCredentialAndRevokeSessions']>(),
    },
    hash: vi.fn<(password: string) => Promise<string>>().mockResolvedValue('digest'),
  };
}

test.each([11, 129])(
  'recovery rejects password length %i before accessing accounts or hashing',
  async (length) => {
    const { repository, hash } = dependencies();
    await expect(
      recoverAccountPassword(repository, hash, 'person@example.test', 'x'.repeat(length)),
    ).rejects.toThrow('Password must contain 12–128 characters');
    expect(repository.findByEmail).not.toHaveBeenCalled();
    expect(hash).not.toHaveBeenCalled();
    expect(repository.replaceCredentialAndRevokeSessions).not.toHaveBeenCalled();
  },
);

test.each([12, 128])(
  'recovery admits password length %i and delegates one atomic replacement',
  async (length) => {
    const { repository, hash } = dependencies();
    const password = 'x'.repeat(length);
    await recoverAccountPassword(repository, hash, ' person@example.test ', password);
    expect(repository.findByEmail).toHaveBeenCalledWith('person@example.test');
    expect(hash).toHaveBeenCalledWith(password);
    expect(repository.replaceCredentialAndRevokeSessions).toHaveBeenCalledExactlyOnceWith(
      'user',
      'digest',
    );
  },
);

test('recovery does not mutate credentials or sessions when lookup or hashing fails', async () => {
  const { repository, hash } = dependencies();
  repository.findByEmail.mockReturnValueOnce(undefined);
  await expect(
    recoverAccountPassword(repository, hash, 'missing@example.test', 'x'.repeat(12)),
  ).rejects.toThrow('Account not found');
  expect(hash).not.toHaveBeenCalled();
  const failure = new Error('Hashing failed');
  hash.mockRejectedValueOnce(failure);
  await expect(
    recoverAccountPassword(repository, hash, 'person@example.test', 'x'.repeat(12)),
  ).rejects.toBe(failure);
  expect(repository.replaceCredentialAndRevokeSessions).not.toHaveBeenCalled();
});
