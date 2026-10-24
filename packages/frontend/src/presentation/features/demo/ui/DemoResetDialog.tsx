import { Button } from '@repo/ui/components/button';
import { type RefObject, useState } from 'react';
import { useI18n } from '#shared/i18n';
import { WorkspaceDialog } from '#shared/ui/WorkspaceDialog';

export function DemoResetDialog({
  onReset,
  onClose,
  triggerRef,
}: {
  onReset: () => Promise<void>;
  onClose: () => void;
  triggerRef: RefObject<HTMLButtonElement | null>;
}) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const reset = async () => {
    setBusy(true);
    setFailed(false);
    try {
      await onReset();
      onClose();
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <WorkspaceDialog
      title={t('resetTitle', { ns: 'demo' })}
      description={t('resetDescription', { ns: 'demo' })}
      finalFocus={triggerRef}
      onClose={() => {
        if (!busy) {
          onClose();
        }
      }}
      footer={
        <>
          <Button variant="outline" disabled={busy} onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button
            disabled={busy}
            focusableWhenDisabled
            aria-busy={busy}
            onClick={() => void reset()}
          >
            {t(busy ? 'resetting' : 'reset', { ns: 'demo' })}
          </Button>
        </>
      }
    >
      {failed && (
        <p role="alert" className="text-sm text-destructive">
          {t('resetFailed', { ns: 'demo' })}
        </p>
      )}
    </WorkspaceDialog>
  );
}
