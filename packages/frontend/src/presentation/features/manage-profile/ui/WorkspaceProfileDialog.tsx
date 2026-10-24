import { Button } from '@repo/ui/components/button';
import { UserRound } from 'lucide-react';
import type { WorkspaceProfile } from '#application';
import { useI18n } from '#shared/i18n';
import { WorkspaceDialog } from '#shared/ui/WorkspaceDialog';

export function WorkspaceProfileDialog({
  account,
  close,
  openSync,
}: {
  account: WorkspaceProfile;
  close: () => void;
  openSync?: () => void;
}) {
  const { t } = useI18n();

  return (
    <WorkspaceDialog
      title={t('recovery.currentWorkspace')}
      onClose={close}
      description={t(account.server ? 'sync.workspaceDescription' : 'profiles.guestDescription')}
    >
      <div className="sync-identity flex items-center gap-3 min-w-0 [&_>_div]:flex-1 [&_>_div]:min-w-0">
        <UserRound className="size-4 inline-block shrink-0 align-middle" />
        <div>
          <strong>{account.server ? account.server.email : t('storage.onDevice')}</strong>
          {account.server && (
            <p className="muted [.modal-body_>_&]:m-0 [.modal-body_>_&]:text-sm [.modal-body_>_&]:leading-(--text-sm--line-height) [.modal-body_>_&]:text-muted-foreground text-muted-foreground">
              {account.server.url}
            </p>
          )}
        </div>
      </div>
      {openSync && (
        <div className="settings-actions [.settings-card_&]:mt-4 flex flex-wrap gap-2 [.sync-settings_&]:flex-wrap">
          <Button variant="outline" onClick={openSync} className={'h-(--control-height)'}>
            {t('sync.settings')}
          </Button>
        </div>
      )}
    </WorkspaceDialog>
  );
}
