import type { CredentialSession } from '#application/host';
import { restoreServerSession } from '../http/server-transport.ts';

// The server's HttpOnly cookie owns browser persistence. Bearer tokens stay in memory.
export function createBrowserCredentialSession(): CredentialSession {
  return {
    restore: restoreServerSession,
    renew: restoreServerSession,
    async remember() {},
    async forget() {},
  };
}
