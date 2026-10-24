export type HostRuntime = 'web' | 'desktop';

export interface CredentialAccount {
  url: string;
  serverId: string;
  userId: string;
}

export interface CredentialSession {
  restore(account: CredentialAccount, signal?: AbortSignal): Promise<string | null>;
  remember(account: CredentialAccount, token: string): Promise<void>;
  forget(account: CredentialAccount): Promise<void>;
}
