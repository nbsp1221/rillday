export interface WorkspaceLockOptions {
  mode?: 'shared' | 'exclusive';
  signal?: AbortSignal;
}

export interface WorkspaceCoordination {
  withWorkspaceLock<T>(
    workspaceId: string,
    action: () => Promise<T>,
    options?: WorkspaceLockOptions,
  ): Promise<T>;
}
