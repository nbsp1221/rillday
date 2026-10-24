import { type RefObject, useEffect, useReducer } from 'react';
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
  captureDraftsRef,
}: {
  workspace: WorkspacePort;
  connection: ConnectionPort;
  saveState: WorkspaceSnapshot['saveState'];
  connectionError: string;
  captureDraftsRef: RefObject<Map<string, TaskCaptureDraft>>;
}) {
  useEffect(
    () =>
      connection.registerDrafts(() =>
        [...captureDraftsRef.current].filter(([, draft]) => Boolean(draft.text.trim())),
      ),
    [connection, captureDraftsRef],
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
