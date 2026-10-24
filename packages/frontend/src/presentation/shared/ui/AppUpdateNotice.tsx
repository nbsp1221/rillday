import { Button } from '@repo/ui/components/button';
import { X } from 'lucide-react';
import { useI18n } from '#shared/i18n';

export function AppUpdateNotice({
  updating,
  failed,
  update,
  dismiss,
}: {
  updating: boolean;
  failed: boolean;
  update: () => void;
  dismiss: () => void;
}) {
  const { t } = useI18n();
  return (
    <aside
      className="app-update-notice fixed right-4 bottom-4 z-140 flex items-center gap-4 max-w-[calc(100vw_-_32px)] py-3 px-4 border border-control-border rounded-md bg-popover text-foreground shadow-[0_8px_28px_var(--shadow)] text-sm leading-(--text-sm--line-height) [&_p]:m-0 [&_>_button]:shrink-0"
      role="status"
      aria-label={t('updates.title')}
    >
      <div>
        <p>{t('updates.available')}</p>
        <p className="app-update-description [.app-update-notice_&]:mt-1 [.app-update-notice_&]:text-muted-foreground [.app-update-notice_&]:text-xs [.app-update-notice_&]:leading-(--text-xs--line-height)">
          {failed ? t('storage.saveIncomplete') : t('updates.finishEdits')}
        </p>
      </div>
      <Button size="sm" disabled={updating} onClick={update}>
        {updating ? t('updates.updating') : t('updates.apply')}
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={t('common.dismiss')}
        disabled={updating}
        onClick={dismiss}
      >
        <X className="size-4 inline-block shrink-0 align-middle" />
      </Button>
    </aside>
  );
}
