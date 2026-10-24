import type { Workspace, WorkspaceTarget } from '@repo/domain';

export interface WorkspaceDecision {
  id: string;
  code: string;
  targets: WorkspaceTarget[];
  choices: { id: string; workspace: Workspace }[];
}

export interface WorkspaceRepositorySnapshot {
  workspace: Workspace;
  saved: boolean;
  error: unknown;
  decisions: WorkspaceDecision[];
}

export interface WorkspaceRepository {
  readonly id: string;
  getSnapshot(): WorkspaceRepositorySnapshot;
  subscribe(listener: () => void): () => void;
  version(target: WorkspaceTarget): string;
  // Acceptance is synchronous; the returned promise reports durable completion.
  commit(workspace: Workspace): Promise<void>;
  resolve(decisionId: string, choiceId: string): Promise<void>;
  flush(): Promise<void>;
  retrySave(): Promise<void>;
  close(): Promise<void>;
}
