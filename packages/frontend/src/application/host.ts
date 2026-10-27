export interface DataDirectoryPort {
  current(): Promise<string>;
  choose(title: string): Promise<string | null>;
  activate(path: string): Promise<void>;
}

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
