import type { WorkspaceLockOptions } from '#application/coordination';

// Locks protect work, not the lifetime of the page. The browser releases them
// when their owner disappears, so another tab can continue without recovery UI.
export function withWorkspaceLock<T>(
  workspaceId: string,
  action: () => Promise<T>,
  options: WorkspaceLockOptions = {},
): Promise<T> {
  if (!navigator.locks) {
    return Promise.reject(new Error('web_locks_required'));
  }
  const mode = options.mode ?? 'exclusive';
  return navigator.locks.request(
    `rillday-workspace:${workspaceId}:operation`,
    { mode, ...(options.signal ? { signal: options.signal } : {}) },
    action,
  );
}
