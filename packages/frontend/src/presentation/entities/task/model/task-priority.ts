import type { Priority } from '#application';

export const taskPriorities: readonly Priority[] = [3, 2, 1, 0];

export const taskPriorityClasses: Record<Priority, string> = {
  0: '[--priority-color:var(--muted-foreground)]',
  1: '[--priority-color:var(--priority-low)]',
  2: '[--priority-color:var(--warning)]',
  3: '[--priority-color:var(--danger-text)]',
};

export function priorityColor(priority: Priority) {
  return priority === 3
    ? 'var(--danger-text)'
    : priority === 2
      ? 'var(--warning)'
      : priority === 1
        ? 'var(--priority-low)'
        : 'var(--muted-foreground)';
}
