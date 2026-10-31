import { Button } from '@repo/ui/components/button';
import { FieldError } from '@repo/ui/components/field';
import { Cloud, HardDrive, LogOut, RefreshCw } from 'lucide-react';
import { useCallback, useState, useSyncExternalStore } from 'react';
import type { ConnectionPort, WorkspacePort, WorkspaceProfile } from '#application';
import type { HostRuntime } from '#shared/lib/host-runtime';
import { useI18n } from '#shared/i18n';
import type { SyncActionRunner } from '../model/sync-forms';
import { syncError } from '../../../shared/lib/operation-errors';
import { SyncPasswordForm, SyncUserAdministration } from './SyncAccountForms';
import { SyncBackupRecovery, SyncConflicts } from './SyncRecovery';
import { SyncServerForm } from './SyncServerForm';

export function SyncSettings({
  connection,
  workspace,
  account,
  runtime,
  suggestedServerUrl,
}: {
  connection: ConnectionPort;
  workspace: WorkspacePort;
  account: WorkspaceProfile;
  runtime: HostRuntime;
  suggestedServerUrl?: string;
}) {
  const { t } = useI18n();
  const state = useSyncExternalStore(connection.subscribe, connection.getSnapshot);
  const sync = useSyncExternalStore(workspace.subscribe, workspace.getSnapshot);
  const [notice, setNotice] = useState('');
  const [localError, setLocalError] = useState('');
  const [logoutConfirm, setLogoutConfirm] = useState(false);
  const active =
    account.server &&
    state.serverUrl === account.server.url &&
    sync.syncState !== 'authentication-required';

  const run = useCallback<SyncActionRunner>(async (action, message = '') => {
    setLocalError('');
    setNotice('');

    try {
      await action();

      if (message) {
        setNotice(message);
      }
    } catch (error) {
      setLocalError(error instanceof Error ? error.message : 'connection_failed');
    }
  }, []);

  const status = t(sync.syncState, { ns: 'sync' });

  return (
    <div className="settings-section sync-settings flex w-full max-w-md flex-col gap-6">
      <SyncIdentity account={account} pending={sync.pending} status={status} />
      <SyncServerForm
        connection={connection}
        active={Boolean(active)}
        suggestedServerUrl={suggestedServerUrl}
        run={run}
      />
      {state.review && (
        <section
          className="sync-connection-review flex flex-col gap-4 rounded-lg bg-surface-inset p-(--layout-card-inset) text-sm"
          aria-label={t('connection.review')}
        >
          <h3 className="text-base font-medium">{t('connection.chooseStrategy')}</h3>
          <p className="settings-description [margin:4px_0_0] text-xs leading-(--text-xs--line-height) text-muted-foreground sync-server-address wrap-anywhere">
            {state.review.email} · {state.review.serverUrl}
          </p>
          <div className="sync-review-counts grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <strong>{t('connection.deviceData')}</strong>
              <p>
                {t('backup.taskHabitSummary', {
                  tasks: state.review.local.tasks,
                  habits: state.review.local.habits,
                })}
              </p>
              <p className="settings-description [margin:4px_0_0] text-xs leading-(--text-xs--line-height) text-muted-foreground">
                {t('backup.otherContentsSummary', {
                  lists: state.review.local.lists,
                  labels: state.review.local.labels,
                  logs: state.review.local.habitLogs,
                })}
              </p>
            </div>
            <div>
              <strong>{t('connection.serverData')}</strong>
              <p>
                {t('backup.taskHabitSummary', {
                  tasks: state.review.remote.tasks,
                  habits: state.review.remote.habits,
                })}
              </p>
              <p className="settings-description [margin:4px_0_0] text-xs leading-(--text-xs--line-height) text-muted-foreground">
                {t('backup.otherContentsSummary', {
                  lists: state.review.remote.lists,
                  labels: state.review.remote.labels,
                  logs: state.review.remote.habitLogs,
                })}
              </p>
            </div>
          </div>
          <p className="settings-description [margin:4px_0_0] text-xs leading-(--text-xs--line-height) text-muted-foreground">
            {t('connection.reviewDescription')}
          </p>
          {Boolean(state.review.drafts) && (
            <p className="settings-description [margin:4px_0_0] text-xs leading-(--text-xs--line-height) text-muted-foreground">
              {t('recovery.inputCountDescription', { count: state.review.drafts ?? 0 })}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              disabled={state.busy}
              onClick={() =>
                void run(() => connection.confirmConnection('include'), t('connection.merged'))
              }
              className={
                'h-(--control-height) bg-button-primary text-button-primary-foreground hover:bg-button-primary-hover'
              }
            >
              {t('connection.merge')}
            </Button>
            <Button
              variant="outline"
              disabled={state.busy}
              onClick={() =>
                void run(
                  () => connection.confirmConnection('server-only'),
                  t('connection.serverOpened'),
                )
              }
              className={'h-(--control-height)'}
            >
              {t('connection.serverOnly')}
            </Button>
            <Button
              variant="ghost"
              disabled={state.busy}
              onClick={() => void run(() => connection.cancelConnection())}
              className={'h-(--control-height) text-muted-foreground hover:text-foreground'}
            >
              {t('common.cancel')}
            </Button>
          </div>
        </section>
      )}
      {account.server && (
        <div className="sync-actions flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={sync.syncState === 'syncing' || state.busy}
            onClick={() => void run(() => workspace.sync(), t('sync.checked'))}
            className={'h-(--control-height)'}
          >
            <RefreshCw className="size-3.5 inline-block shrink-0 align-middle" />
            {t('sync.now')}
          </Button>
          <Button
            variant="ghost"
            disabled={state.busy}
            onClick={() => setLogoutConfirm(true)}
            className={'h-(--control-height) text-muted-foreground hover:text-foreground'}
          >
            <LogOut className="size-3.5 inline-block shrink-0 align-middle" />
            {t('connection.disconnect')}
          </Button>
        </div>
      )}
      {logoutConfirm && account.server && (
        <section
          className="sync-disconnect flex flex-col gap-4 rounded-lg bg-surface-inset p-(--layout-card-inset) text-sm"
          aria-label={t('connection.disconnect')}
        >
          <h3 className="text-base font-medium">{t('connection.disconnectChoice')}</h3>
          <p className="settings-description [margin:4px_0_0] text-xs leading-(--text-xs--line-height) text-muted-foreground">
            {t('connection.disconnectDescription')}
          </p>
          {Boolean(state.backups?.some((backup) => backup.localOnly)) && (
            <p className="settings-description [margin:4px_0_0] text-xs leading-(--text-xs--line-height) text-muted-foreground">
              {t('recovery.localCopyHint')}
            </p>
          )}
          <p className="settings-description [margin:4px_0_0] text-xs leading-(--text-xs--line-height) text-muted-foreground">
            {t('connection.otherWindowInputs')}
          </p>
          {sync.pending > 0 && (
            <p
              className="settings-description [margin:4px_0_0] text-xs leading-(--text-xs--line-height) text-muted-foreground"
              role="note"
            >
              {t('connection.syncBeforeRemove')}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button
              variant={runtime === 'desktop' ? 'default' : 'outline'}
              disabled={state.busy}
              onClick={() =>
                void run(async () => {
                  await connection.logout('keep');
                  setLogoutConfirm(false);
                }, t('connection.disconnectedKept'))
              }
              className={'h-(--control-height) pointer-coarse:h-11'}
            >
              {t('connection.keepAndDisconnect')}
            </Button>
            <Button
              variant={runtime === 'desktop' ? 'outline' : 'destructive'}
              disabled={state.busy || sync.pending > 0}
              onClick={() =>
                void run(async () => {
                  await connection.logout('remove');
                  setLogoutConfirm(false);
                }, t('connection.disconnectedRemoved'))
              }
              className={
                runtime === 'desktop'
                  ? 'h-(--control-height) border-danger-text bg-transparent text-danger-text hover:bg-danger-surface'
                  : 'h-(--control-height) bg-button-destructive text-destructive-foreground hover:bg-button-destructive-hover'
              }
            >
              {t('connection.removeAndDisconnect')}
            </Button>
            <Button
              variant="ghost"
              disabled={state.busy}
              onClick={() => setLogoutConfirm(false)}
              className={'h-(--control-height) text-muted-foreground hover:text-foreground'}
            >
              {t('common.cancel')}
            </Button>
          </div>
        </section>
      )}
      <SyncBackupRecovery connection={connection} run={run} />
      <SyncConflicts connection={connection} workspace={workspace} run={run} />
      <SyncUserAdministration
        connection={connection}
        account={account}
        active={Boolean(active)}
        run={run}
      />
      <SyncPasswordForm connection={connection} active={Boolean(active)} run={run} />

      {(localError || state.error || sync.error) && (
        <FieldError className="sync-error wrap-anywhere">
          {syncError(t, localError || state.error || sync.error)}
        </FieldError>
      )}
      {notice && (
        <p
          className="settings-description [margin:4px_0_0] text-xs leading-(--text-xs--line-height) text-muted-foreground"
          role="status"
        >
          {notice}
        </p>
      )}
    </div>
  );
}

function SyncIdentity({
  account,
  pending,
  status,
}: {
  account: WorkspaceProfile;
  pending: number;
  status: string;
}) {
  const { t } = useI18n();

  return (
    <div className="sync-identity flex min-w-0 items-center gap-3">
      {account.server ? (
        <Cloud className="size-4 inline-block shrink-0 align-middle" />
      ) : (
        <HardDrive className="size-4 shrink-0" />
      )}
      <div className="min-w-0 flex-1">
        <strong className="wrap-anywhere text-sm font-medium">
          {account.server ? account.server.email : t('sync.localTitle')}
        </strong>
        <p className="mt-1 text-sm text-muted-foreground">
          {account.server
            ? pending > 0
              ? t('sync.statusPending', { status, count: pending })
              : status
            : t('profiles.guestDescription')}
        </p>
        {account.server && (
          <p className="settings-description [margin:4px_0_0] text-xs leading-(--text-xs--line-height) text-muted-foreground sync-server-address wrap-anywhere">
            {account.server.url}
          </p>
        )}
      </div>
      {account.server && (
        <span className="sync-role py-[3px] px-2 rounded-md bg-surface-hover text-xs text-muted-foreground">
          {t(account.server.role === 'admin' ? 'auth.administrator' : 'auth.user')}
        </span>
      )}
    </div>
  );
}
