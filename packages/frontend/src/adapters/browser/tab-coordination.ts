import type { WorkspaceLockOptions } from '#application/coordination';

// Locks protect work, not the lifetime of the page. The browser releases them
// when their owner disappears, so another tab can continue without recovery UI.
export function withWorkspaceLock<T>(
  workspaceId: string,
  action: () => Promise<T>,
  options: WorkspaceLockOptions = {},
): Promise<T> {
  // Browser support is optional even though lib.dom declares this property.
  const locks = navigator.locks as LockManager | undefined;
  if (!locks) {
    return Promise.reject(new Error('web_locks_required'));
  }
  const mode = options.mode ?? 'exclusive';
  return locks.request(
    `rillday-workspace:${workspaceId}:operation`,
    { mode, ...(options.signal ? { signal: options.signal } : {}) },
    action,
  );
}
