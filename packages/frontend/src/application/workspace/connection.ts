import type { WorkspaceContents } from '@repo/domain';
import type { WorkspaceProfile } from './model.ts';
import type { WorkspacePort } from './persistence.ts';

export interface ServerInformation {
  product: 'Rillday';
  protocol: 1;
  serverId: string;
  setupRequired: boolean;
  registration: 'administrator';
  maxAccounts: number;
}

export interface ServerUser {
  id: string;
  email: string;
  name: string;
  role: 'user' | 'admin';
  banned: boolean | null;
}

export interface LoginDetails {
  email: string;
  password: string;
  name?: string;
}

export interface ConnectionReview {
  serverUrl: string;
  email: string;
  name: string;
  local: WorkspaceContents;
  remote: WorkspaceContents;
  drafts?: number;
}

export interface ConnectionBackup {
  id: string;
  createdAt: string;
  reason: 'connection' | 'draft';
  contents: WorkspaceContents;
  name?: string;
  drafts?: number;
  localOnly?: boolean;
}

export interface RecoveredInput {
  key: string;
  text: string;
}

export interface ConnectionState {
  serverUrl: string;
  server: ServerInformation | null;
  busy: boolean;
  transitioning?: boolean;
  error: string;
  emailHint: string;
  users: ServerUser[];
  review?: ConnectionReview | null;
  backups?: ConnectionBackup[];
  runtime?: 'web' | 'desktop';
}

export interface ConnectionPort {
  readonly serverConnectionEnabled?: boolean;
  registerDrafts: (read: () => [string, unknown][]) => () => void;
  getSnapshot: () => ConnectionState;
  subscribe: (listener: () => void) => () => void;
  checkServer: (url: string) => Promise<ServerInformation>;
  setup: (details: LoginDetails) => Promise<void>;
  login: (details: LoginDetails) => Promise<void>;
  logout: (choice?: 'keep' | 'remove') => Promise<void>;
  confirmConnection: (choice: 'include' | 'server-only') => Promise<void>;
  cancelConnection: () => Promise<void>;
  downloadConnectionBackup: (id: string) => Promise<string>;
  recoverInputs: (id: string) => Promise<RecoveredInput[]>;
  loadUsers: () => Promise<void>;
  createUser: (details: LoginDetails) => Promise<void>;
  setUserDisabled: (id: string, disabled: boolean) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  prepareLogin: (account?: WorkspaceProfile) => void;
}

export interface AccountHostState {
  accounts: WorkspaceProfile[];
  activeId: string;
  resetIdentity: string;
  workspace: WorkspacePort;
  connection: ConnectionPort;
  settingsRequest: number;
}

export interface AccountHostPort {
  getSnapshot: () => AccountHostState;
  subscribe: (listener: () => void) => () => void;
  renameAccount: (id: string, name: string) => Promise<void>;
}
