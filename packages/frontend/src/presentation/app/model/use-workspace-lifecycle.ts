import { useEffect, useReducer } from 'react';
import type {
  ConnectionPort,
  TaskCaptureDraft,
  WorkspacePort,
  WorkspaceSnapshot,
} from '#application';

export function useWorkspaceLifecycle({
  workspace,
  connection,
  saveState,
  connectionError,
  captureDrafts,
}: {
  workspace: WorkspacePort;
  connection: ConnectionPort;
  saveState: WorkspaceSnapshot['saveState'];
  connectionError: string;
  captureDrafts: Map<string, TaskCaptureDraft>;
}) {
  useEffect(
    () =>
      connection.registerDrafts(() =>
        [...captureDrafts].filter(([, draft]) => Boolean(draft.text.trim())),
      ),
    [connection, captureDrafts],
  );

  useEffect(() => {
    if (saveState === 'saved' && connectionError !== 'input_recovery_failed') {
      return;
    }

    const pending = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };

    window.addEventListener('beforeunload', pending);
    return () => window.removeEventListener('beforeunload', pending);
  }, [saveState, connectionError]);

  const [, refreshClock] = useReducer((value: number) => value + 1, 0);
  useEffect(() => {
    const timer = setInterval(() => {
      // Relative dates must advance even when no stored record has changed.
      refreshClock();
      void workspace.refresh().catch(() => undefined);
    }, 60000);
    return () => clearInterval(timer);
  }, [workspace]);
}
