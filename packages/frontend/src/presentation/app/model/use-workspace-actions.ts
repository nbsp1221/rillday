import { type RefObject, useCallback, useMemo } from 'react';
import type { WorkspaceController } from '#entities/workspace';
import {
  type AppPreferences,
  type WorkspaceIntent,
  type WorkspacePort,
  createTaskActions,
} from '#application';
import { withTaskActionFeedback } from '#entities/task';
import { useI18n } from '#shared/i18n';
import { operationError } from '../../shared/lib/operation-errors';

export function useWorkspaceActions({
  workspace,
  preferences,
  notify,
  selectTask,
  historyRevisionRef,
}: {
  workspace: WorkspacePort;
  preferences: AppPreferences;
  notify: WorkspaceController['notify'];
  selectTask: WorkspaceController['selectTask'];
  historyRevisionRef: RefObject<number>;
}) {
  const { t } = useI18n();
  const runOperation = useCallback(
    (operation: () => void, onError?: (error: unknown) => void) => {
      try {
        operation();
        historyRevisionRef.current++;
        return true;
      } catch (error) {
        if (onError) {
          onError(error);
        } else {
          notify(
            operationError(t, error instanceof Error ? error.message : '', 'operations.saveFailed'),
          );
        }
        return false;
      }
    },
    [notify, historyRevisionRef, t],
  );
  const apply = useCallback(
    (intents: WorkspaceIntent | WorkspaceIntent[]) => runOperation(() => workspace.apply(intents)),
    [workspace, runOperation],
  );

  const taskActions = useMemo(
    () =>
      withTaskActionFeedback(
        createTaskActions(workspace, () => preferences),
        {
          accepted: () => {
            historyRevisionRef.current++;
          },
          notify,
        },
        t,
      ),
    [workspace, preferences, historyRevisionRef, notify, t],
  );

  const deleteTask = useCallback(
    (id: string) => {
      const result = taskActions.trash(id);
      if (result.status === 'applied') {
        selectTask(null);
      }
      return result;
    },
    [taskActions, selectTask],
  );

  return { apply, runOperation, taskActions, deleteTask };
}
