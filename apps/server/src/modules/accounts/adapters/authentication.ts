import type { IncomingHttpHeaders } from 'node:http';
import { AsyncLocalStorage } from 'node:async_hooks';
import { betterAuth } from 'better-auth';
import { APIError } from 'better-auth/api';
import { getMigrations } from 'better-auth/db/migration';
import { fromNodeHeaders } from 'better-auth/node';
import { admin, bearer } from 'better-auth/plugins';
import { defaultAc } from 'better-auth/plugins/admin/access';
import type { Store } from '../../../storage.ts';
import type {
  AccountAccess,
  AccountRegistration,
  AuthenticationSession,
} from '../application/ports.ts';
import { HttpFault } from '../../../http-errors.ts';
import { initializeAccountConstraints } from '../../../initialize-database.ts';
import { maximumPasswordLength, minimumPasswordLength } from '../domain/policies.ts';
import { findSessionToken } from './sqlite.ts';

export async function createAuthentication(
  store: Store,
  options: { origin: string; origins: string[]; secret: string },
) {
  const creationRole = new AsyncLocalStorage<'admin' | 'user'>();
  const administratorPlugin = admin({
    roles: {
      admin: defaultAc.newRole({ user: ['create', 'list', 'ban', 'get'], session: ['revoke'] }),
      user: defaultAc.newRole({ user: [], session: [] }),
    },
  });
  const plugins: [ReturnType<typeof bearer>, typeof administratorPlugin] = [
    bearer(),
    administratorPlugin,
  ];
  const config = {
    database: store.raw,
    baseURL: options.origin,
    secret: options.secret,
    trustedOrigins: options.origins,
    emailAndPassword: {
      enabled: true,
      minPasswordLength: minimumPasswordLength,
      maxPasswordLength: maximumPasswordLength,
      autoSignIn: false,
    },
    plugins,
    session: { expiresIn: 86400 },
    databaseHooks: {
      user: {
        create: {
          before: (user: { email: string; name: string }) => {
            const role = creationRole.getStore();
            if (!role) {
              throw new APIError('FORBIDDEN', {
                message: 'Registration is managed by the server administrator',
              });
            }
            return Promise.resolve({ data: { ...user, role } });
          },
        },
      },
    },
  };
  const migrations = await getMigrations(config);
  await migrations.runMigrations();
  // The DB constraint also arbitrates concurrent setup attempts in separate processes.
  initializeAccountConstraints(store.raw);
  const auth = betterAuth(config);
  let passwordWork = 0;

  async function passwordJob<T>(action: () => Promise<T>) {
    if (passwordWork >= 2) {
      throw new HttpFault('auth_busy', 503);
    }

    passwordWork++;
    try {
      return await action();
    } finally {
      passwordWork--;
    }
  }

  const registration: AccountRegistration = {
    async create(input, role) {
      const result = await passwordJob(() =>
        creationRole.run(role, () =>
          // Better Auth requires a display name; account identity is the email.
          auth.api.signUpEmail({ body: { ...input, name: input.email.toLowerCase() } }),
        ),
      );
      return { user: result.user };
    },
  };

  async function session(headers: IncomingHttpHeaders): Promise<AuthenticationSession | null> {
    const value = await auth.api.getSession({ headers: fromNodeHeaders(headers) });
    return value
      ? { id: value.session.id, user: value.user, expiresAt: value.session.expiresAt }
      : null;
  }

  async function revokeSessions(headers: IncomingHttpHeaders, owner: string, sessionIds: string[]) {
    const credentials = fromNodeHeaders(headers);
    for (const sessionId of sessionIds) {
      const token = findSessionToken(store, owner, sessionId);
      if (token !== undefined) {
        await auth.api.revokeSession({ headers: credentials, body: { token } });
      }
    }
  }

  function access(headers: IncomingHttpHeaders): AccountAccess {
    const credentials = fromNodeHeaders(headers);
    return {
      async session() {
        const value = await auth.api.getSession({ headers: credentials });
        return value ? { user: value.user, expiresAt: value.session.expiresAt } : null;
      },
      async setDisabled(id, disabled) {
        if (disabled) {
          await auth.api.banUser({ headers: credentials, body: { userId: id } });
        } else {
          await auth.api.unbanUser({ headers: credentials, body: { userId: id } });
        }
      },
    };
  }

  function isSessionActive(sessionId: string, owner: string) {
    const now = new Date().toISOString();
    return Boolean(
      store
        .prepare(`
      SELECT 1 FROM session s JOIN user u ON u.id=s.userId
      WHERE s.id=? AND s.userId=? AND s.expiresAt>?
      AND (coalesce(u.banned,0)=0 OR (u.banExpires IS NOT NULL AND u.banExpires<=?))
    `)
        .get(sessionId, owner, now, now),
    );
  }

  return { auth, registration, access, session, revokeSessions, passwordJob, isSessionActive };
}
