import type { CredentialAccount, CredentialSession } from '@repo/frontend/application';
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

export const desktopCredentials: CredentialSession = {
  restore: async (account) =>
    invoke<string | null>('credential_read', { key: await credentialKey(account) }),
  remember: async (account, value) =>
    invoke('credential_write', { key: await credentialKey(account), value }),
  forget: async (account) => invoke('credential_remove', { key: await credentialKey(account) }),
};
