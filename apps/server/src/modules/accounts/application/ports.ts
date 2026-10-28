export interface AccountInput {
  email: string;
  password: string;
}

export interface AccountUser {
  id: string;
  email: string;
  name: string;
  role?: string | null;
}

export interface AccountSession {
  user: AccountUser;
  expiresAt: Date;
}

export interface AuthenticationSession extends AccountSession {
  id: string;
}

export interface AccountSummary extends AccountUser {
  role: string;
  banned: number | null;
}

export interface AccountRepository {
  hasAdministrator(): boolean;
  count(): number;
  list(): AccountSummary[];
  find(id: string): { id: string; role: string } | undefined;
}

export interface AccountRegistration {
  create(input: AccountInput, role: 'admin' | 'user'): Promise<{ user: AccountUser }>;
}

// A request-scoped adapter keeps SDK credentials out of application operations.
export interface AccountAccess {
  session(): Promise<AccountSession | null>;
  setDisabled(id: string, disabled: boolean): Promise<void>;
}

export interface PasswordRecoveryRepository {
  findByEmail(email: string): { id: string } | undefined;
  replaceCredentialAndRevokeSessions(userId: string, digest: string): void;
}
