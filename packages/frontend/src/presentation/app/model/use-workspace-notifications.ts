import { useToastManager } from '@repo/ui/components/toast';
import { type RefObject, useCallback, useEffect, useEffectEvent } from 'react';
import { useI18n } from '#shared/i18n';
import { syncError } from '../../shared/lib/operation-errors';

export function useWorkspaceNotifications(error: string, historyRevisionRef: RefObject<number>) {
  const { t } = useI18n();
  const { toasts, add } = useToastManager<{ undoRevision?: number }>();
  const notify = useCallback(
    (message: string, options?: { undoable?: boolean }) => {
      add({
        id: 'workspace-notification',
        title: message,
        data: { undoRevision: options?.undoable ? historyRevisionRef.current : undefined },
      });
    },
    [add, historyRevisionRef],
  );

  const onConnectionError = useEffectEvent((value: string) => {
    if (['saved_inputs_available', 'saved_inputs_require_login'].includes(value)) {
      notify(syncError(t, value));
    }
  });
  useEffect(() => {
    onConnectionError(error);
  }, [error]);
  useEffect(() => {
    const handler = () => notify(t('storage.closeBlocked'));

    window.addEventListener('rillday-close-save-error', handler);
    return () => window.removeEventListener('rillday-close-save-error', handler);
  }, [notify, t]);
  return { toasts, notify };
}
