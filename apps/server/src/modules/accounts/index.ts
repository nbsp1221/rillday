import type { Store } from '../../storage.ts';
import { createAuthentication } from './adapters/authentication.ts';
import { SqliteAccountRepository } from './adapters/sqlite.ts';
import { AccountService } from './application/accounts.ts';

export async function createAccountModule(
  store: Store,
  options: { origin: string; origins: string[]; secret: string },
) {
  const adapter = await createAuthentication(store, options);
  const service = new AccountService(new SqliteAccountRepository(store), adapter.registration);
  const authentication = {
    handler: (request: Request) => adapter.auth.handler(request),
    access: adapter.access,
    session: adapter.session,
    isSessionActive: adapter.isSessionActive,
    revokeSessions: adapter.revokeSessions,
    passwordJob: adapter.passwordJob,
  };

  return { service, authentication };
}

export type AccountAuthentication = Awaited<
  ReturnType<typeof createAccountModule>
>['authentication'];

export { AccountError, type AccountErrorCode } from './domain/policies.ts';
export { registerAccountRoutes } from './adapters/http.ts';
export { registerAuthenticationAdapter } from './adapters/authentication-http.ts';
export { resetAccountPassword } from './adapters/local-recovery.ts';
