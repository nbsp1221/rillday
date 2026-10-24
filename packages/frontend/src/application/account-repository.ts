import type { WorkspaceContents } from '@repo/domain';
import type { WorkspaceRecord as WorkspaceProfile } from './account-record.ts';
import type { ConnectionBackup } from './workspace/connection.ts';

export interface AccountRegistry {
  activeId: string;
  accounts: WorkspaceProfile[];
}

export interface AccountBackup {
  source: string;
  documentId: string;
  revision: string;
  contents: WorkspaceContents;
  scope?: string;
  reason?: ConnectionBackup['reason'];
  name?: string;
  drafts?: number;
}

export interface AccountRepository {
  loadRegistry(): Promise<AccountRegistry>;
  readRegistry(): Promise<AccountRegistry>;
  saveRegistry(registry: AccountRegistry): Promise<AccountRegistry>;
  subscribeRegistry(listener: () => void): () => void;
  loadServerUrl(): Promise<string>;
  saveServerUrl(value: string): Promise<void>;
  saveConnectionBackup(id: string, workspaceId: string, backup: AccountBackup): Promise<void>;
  connectionBackups(
    workspaceId: string,
    scope?: string,
  ): Promise<(ConnectionBackup & { documentId: string; revision: string })[]>;
  downloadConnectionBackup(id: string, workspaceId: string, scope?: string): Promise<string>;
  removeScopedBackups(workspaceId: string, scope: string): Promise<void>;
  close(): Promise<void>;
}
