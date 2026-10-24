import { validateRecoveryPassword } from '../domain/policies.ts';
import type { PasswordRecoveryRepository } from './ports.ts';

export async function recoverAccountPassword(
  repository: PasswordRecoveryRepository,
  hashPassword: (password: string) => Promise<string>,
  email: string,
  password: string,
) {
  validateRecoveryPassword(password);
  const user = repository.findByEmail(email.trim());
  if (!user) {
    throw new Error('Account not found');
  }

  const digest = await hashPassword(password);
  repository.replaceCredentialAndRevokeSessions(user.id, digest);
}
