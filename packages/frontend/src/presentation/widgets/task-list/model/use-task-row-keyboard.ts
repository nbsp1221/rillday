import type { KeyboardEvent } from 'react';
import type { Task } from '#application';
import { useWorkspace } from '#entities/workspace';

export function useTaskRowKeyboard(
  task: Task,
  startEditing: () => void,
  reorder?: (direction: 'up' | 'down' | 'first' | 'last') => void,
) {
  const { selectTask, taskActions } = useWorkspace();
  return function keyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget || event.nativeEvent.isComposing) {
      return;
    }
    if (
      reorder &&
      event.ctrlKey &&
      event.altKey &&
      ['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)
    ) {
      event.preventDefault();
      reorder(
        event.key === 'Home'
          ? 'first'
          : event.key === 'End'
            ? 'last'
            : event.key === 'ArrowUp'
              ? 'up'
              : 'down',
      );
      return;
    }
    const scope =
      event.currentTarget.closest('.task-scroll,.quadrant-tasks') ??
      event.currentTarget.parentElement;
    const rows = Array.from(scope?.querySelectorAll<HTMLDivElement>('.task-row') ?? []);
    const index = rows.indexOf(event.currentTarget);
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      const next =
        event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? rows.length - 1
            : Math.max(0, Math.min(rows.length - 1, index + (event.key === 'ArrowDown' ? 1 : -1)));
      rows[next]?.focus();
    } else if (event.key === 'Enter') {
      event.preventDefault();
      selectTask(task.id);
      requestAnimationFrame(() =>
        document.querySelector<HTMLTextAreaElement>('.task-detail .td-title')?.focus(),
      );
    } else if (event.key === ' ' && !task.deleted) {
      event.preventDefault();
      const neighbor = rows[index + 1] ?? rows[index - 1];
      taskActions.toggle(task.id);
      requestAnimationFrame(() => {
        const same = Array.from(scope?.querySelectorAll<HTMLDivElement>('.task-row') ?? []).find(
          (item) => item.dataset.taskId === task.id,
        );
        if (same) {
          same.focus({ preventScroll: true });
        } else if (neighbor?.isConnected) {
          neighbor.focus({ preventScroll: true });
        }
      });
    } else if (event.key === 'F2') {
      event.preventDefault();
      startEditing();
    }
  };
}
