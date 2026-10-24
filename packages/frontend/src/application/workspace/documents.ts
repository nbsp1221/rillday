import type { Workspace } from '@repo/domain';
import type { WorkspaceSynchronization } from '../workspace-session.ts';
import type { WorkspaceRepository } from './repository.ts';

export interface RemoteWorkspace {
  url: string;
  serverId: string;
  authorize(signal: AbortSignal): Promise<string>;
}

export interface OpenWorkspace {
  repository: WorkspaceRepository;
  revision(): string;
  pause(): () => void;
  exportData(): Promise<string>;
  includeArchive(source: string): Promise<void>;
  replaceArchive(source: string): Promise<void>;
  synchronization?: WorkspaceSynchronization;
}

export interface WorkspaceDocuments {
  create(workspace: Workspace): Promise<OpenWorkspace>;
  open(id: string, remote?: RemoteWorkspace): Promise<OpenWorkspace>;
  inspectArchive(source: string): Workspace;
  restoreArchive(source: string): Promise<OpenWorkspace>;
  remove(id: string): Promise<void>;
}
