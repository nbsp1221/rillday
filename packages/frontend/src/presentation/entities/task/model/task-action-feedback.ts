import type { TFunction } from 'i18next';
import type { TaskActionResult, TaskActions } from '#application';
import { operationError } from '../../../shared/lib/operation-errors';

export interface TaskActionFeedback {
  accepted: () => void;
  notify: (message: string, options?: { undoable?: boolean }) => void;
}

export function withTaskActionFeedback(
  actions: TaskActions,
  feedback: TaskActionFeedback,
  t: TFunction,
): TaskActions {
  function present<T>(result: TaskActionResult<T>, messageKey?: string, undoable = true) {
    if (result.status === 'failed') {
      feedback.notify(operationError(t, result.code, 'operations.saveFailed'));
    }

    if (result.status === 'applied') {
      feedback.accepted();

      if (messageKey) {
        feedback.notify(t(messageKey), { undoable });
      }
    }

    return result;
  }

  return {
    create: (...args) => present(actions.create(...args)),
    createMany: (...args) => present(actions.createMany(...args)),
    createSubtask: (...args) => present(actions.createSubtask(...args)),
    createInQuadrant: (...args) => present(actions.createInQuadrant(...args)),
    update: (...args) => present(actions.update(...args)),
    setDate: (...args) => present(actions.setDate(...args)),
    setTime: (...args) => present(actions.setTime(...args)),
    setRepeat: (...args) => present(actions.setRepeat(...args)),
    toggle: (...args) => present(actions.toggle(...args), 'tasks.statusUpdated'),
    trash: (...args) => present(actions.trash(...args), 'tasks.trashedFeedback'),
    restore: (...args) => present(actions.restore(...args), 'tasks.restored'),
    purge: (ids, undoable) => {
      const allowUndo = undoable ?? true;

      return present(
        actions.purge(ids, allowUndo),
        allowUndo ? 'tasks.purged' : undefined,
        allowUndo,
      );
    },
    duplicate: (...args) => present(actions.duplicate(...args), 'tasks.duplicated'),
    reorder: (...args) => present(actions.reorder(...args), 'tasks.orderUpdated'),
    schedule: (...args) => present(actions.schedule(...args)),
    moveToList: (...args) => present(actions.moveToList(...args)),
    moveToQuadrant: (...args) => present(actions.moveToQuadrant(...args)),
    undo: () => present(actions.undo(), 'common.undone', false),
    redo: () => present(actions.redo()),
  };
}
