import { useToastManager } from '@repo/ui/components/toast';
import { useCallback, useEffect, useEffectEvent } from 'react';
import { useI18n } from '#shared/i18n';
import { syncError } from '../../shared/lib/operation-errors';

export function useWorkspaceNotifications(error: string) {
  const { t } = useI18n();
  const { toasts, add, update } = useToastManager<{ undoable?: boolean }>();
  const onAccepted = useCallback(() => {
    update('workspace-notification', { data: { undoable: false } });
  }, [update]);
  const notify = useCallback(
    (message: string, options?: { undoable?: boolean }) => {
      add({
        id: 'workspace-notification',
        title: message,
        data: { undoable: options?.undoable },
      });
    },
    [add],
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
  return { toasts, notify, onAccepted };
}
