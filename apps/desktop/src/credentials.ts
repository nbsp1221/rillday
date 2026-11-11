import type { CredentialAccount, CredentialSession } from '@repo/frontend/application';
import { restoreServerSession } from '@repo/frontend/network/http';
import { invoke } from '@tauri-apps/api/core';

// Web sessions use HttpOnly cookies. Only the desktop adapter persists bearer tokens.
async function credentialKey(account: CredentialAccount) {
  const identity = new TextEncoder().encode(
    account.url + '|' + account.serverId + '|' + account.userId,
  );
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', identity)), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}

async function readCredential(account: CredentialAccount) {
  return invoke<string | null>('credential_read', { key: await credentialKey(account) });
}

export const desktopCredentials: CredentialSession = {
  restore: readCredential,
  async renew(account, signal) {
    const token = await readCredential(account);
    signal.throwIfAborted();
    return token ? restoreServerSession(account, signal, token) : null;
  },
  remember: async (account, value) =>
    invoke('credential_write', { key: await credentialKey(account), value }),
  forget: async (account) => invoke('credential_remove', { key: await credentialKey(account) }),
};
