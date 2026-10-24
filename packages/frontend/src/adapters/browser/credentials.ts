import type { CredentialSession } from '#application/host';
import { sessionResponse } from '#application/server-responses';
import { fetchServer, responseJson, verifyServerIdentity } from '../http/server-transport.ts';

// The server's HttpOnly cookie owns browser persistence. Bearer tokens stay in memory.
export function createBrowserCredentialSession(): CredentialSession {
  return {
    async restore(account, signal = AbortSignal.timeout(12000)) {
      await verifyServerIdentity(
        await fetchServer(account.url + '/v1/server', {
          credentials: 'omit',
          signal,
        }),
        account.serverId,
      );
      const session = sessionResponse.parse(
        await responseJson(
          await fetchServer(account.url + '/api/auth/get-session', {
            credentials: 'include',
            signal,
          }),
        ),
      );
      return session?.user.id === account.userId ? session.session.token : null;
    },
    async remember() {},
    async forget() {},
  };
}
