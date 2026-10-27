import { Field as FormField } from '@base-ui/react/field';
import { Button } from '@repo/ui/components/button';
import { Input } from '@repo/ui/components/input';
import { Cloud, LogOut, RefreshCw, UserRound } from 'lucide-react';
import { useState, useSyncExternalStore } from 'react';
import type { ConnectionPort, WorkspacePort, WorkspaceProfile } from '#application';
import type { HostRuntime } from '#shared/lib/host-runtime';
import { useI18n } from '#shared/i18n';
import { syncError } from '../../../shared/lib/operation-errors';
import { preventComposition } from '../model/sync-forms';
import { SyncPasswordForm, SyncUserAdministration } from './SyncAccountForms';
import { SyncLoginForm } from './SyncLoginForm';
import { SyncBackupRecovery, SyncConflicts } from './SyncRecovery';

export function SyncSettings({
  connection,
  workspace,
  account,
  runtime,
}: {
  connection: ConnectionPort;
  workspace: WorkspacePort;
  account: WorkspaceProfile;
  runtime: HostRuntime;
}) {
  const { t } = useI18n();
  const state = useSyncExternalStore(connection.subscribe, connection.getSnapshot);
  const sync = useSyncExternalStore(workspace.subscribe, workspace.getSnapshot);
  const [url, setUrl] = useState(state.serverUrl);
  const [notice, setNotice] = useState('');
  const [localError, setLocalError] = useState('');
  const [logoutConfirm, setLogoutConfirm] = useState(false);
  const active =
    account.server &&
    state.serverUrl === account.server.url &&
    sync.syncState !== 'authentication-required';

  async function run(action: () => Promise<unknown>, message = '') {
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
  }

  const status = t(sync.syncState, { ns: 'sync' });

  return (
    <div className="settings-section flex flex-col gap-0 [&_>_p:not(.settings-description)]:[margin:12px_0_0] [&_>_p:not(.settings-description)]:text-sm [&_>_p:not(.settings-description)]:leading-(--text-sm--line-height) [&_>_h2]:text-base [&_>_h2]:font-semibold [&_>_h2]:[margin:0_0_12px] [&_>_h2]:leading-(--text-base--line-height) [&_>_h3]:text-base [&_>_h3]:font-semibold [&_>_h3]:[margin:0_0_12px] [&_>_h3]:leading-(--text-base--line-height) sync-settings gap-(--layout-section-gap) [&_h3]:m-0 [&_h3]:text-sm [&_h3]:font-semibold">
      <SyncIdentity account={account} pending={sync.pending} status={status} />
      <p className="settings-description [margin:4px_0_0] text-xs leading-(--text-xs--line-height) text-muted-foreground">
        {t(account.server ? 'sync.workspaceDescription' : 'profiles.guestDescription')}
      </p>
      <form
        className="sync-server-form"
        onKeyDown={preventComposition}
        onSubmit={(event) => {
          event.preventDefault();
          void run(() => connection.checkServer(url), t('connection.verified'));
        }}
      >
        <FormField.Root className={'form-field flex min-w-0 flex-col gap-(--layout-field-gap)'}>
          <FormField.Label className="text-sm text-muted-foreground">
            {t('connection.serverUrl')}
          </FormField.Label>
          <div className="sync-server-field flex items-center gap-2 [&_input]:flex-1 [&_input]:min-w-0 [&_button]:shrink-0 [@media(max-width:_640px)]:flex-wrap [@media(max-width:_640px)]:[&_input]:basis-full">
            <Input
              aria-label={t('connection.serverUrl')}
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              placeholder="https://rillday.example.com"
              inputMode="url"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              required
              disabled={state.busy || Boolean(state.review)}
              className={
                'h-(--control-height) border-control-border bg-card px-[9px] py-[7px] text-sm'
              }
            />
            <Button
              type="submit"
              variant="outline"
              disabled={state.busy || Boolean(state.review)}
              className={'h-(--control-height)'}
            >
              {t('connection.check')}
            </Button>
          </div>
        </FormField.Root>
      </form>
      {state.server &&
        state.serverUrl.startsWith('http:') &&
        !/^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::|\/|$)/.test(state.serverUrl) && (
          <p
            className="settings-description [margin:4px_0_0] text-xs leading-(--text-xs--line-height) text-muted-foreground"
            role="note"
          >
            {t('connection.insecureWarning')}
          </p>
        )}
      <SyncLoginForm connection={connection} active={Boolean(active)} run={run} />
      {state.review && (
        <section
          className="settings-card p-(--layout-card-inset) rounded-lg bg-surface-inset [&_>_h3]:[margin:0_0_8px] [&_>_h3]:text-base [&_>_h3]:font-medium [&_>_h3]:leading-(--text-base--line-height) [&_>_p:not(.settings-description)]:m-0 [&_>_p:not(.settings-description)]:text-sm [&_>_p:not(.settings-description)]:leading-(--text-sm--line-height) [.settings-card_+_&]:mt-(--layout-section-gap) [.settings-row_+_&]:mt-(--layout-section-gap) [.sync-settings_&]:m-0 sync-connection-review flex flex-col gap-3"
          aria-label={t('connection.review')}
        >
          <h3>{t('connection.chooseStrategy')}</h3>
          <p className="settings-description [margin:4px_0_0] text-xs leading-(--text-xs--line-height) text-muted-foreground sync-server-address wrap-anywhere">
            {state.review.email} · {state.review.serverUrl}
          </p>
          <div className="sync-review-counts grid grid-cols-[repeat(2,_minmax(0,_1fr))] gap-4 py-2 [&_p]:[margin:6px_0_0] [@media(max-width:_640px)]:grid-cols-[minmax(0,_1fr)]">
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
          <div className="settings-actions [.settings-card_&]:mt-4 flex flex-wrap gap-2 [.sync-settings_&]:flex-wrap">
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
        <div className="settings-actions [.settings-card_&]:mt-4 flex flex-wrap gap-2 [.sync-settings_&]:flex-wrap sync-actions">
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
          className="settings-card p-(--layout-card-inset) rounded-lg bg-surface-inset [&_>_h3]:[margin:0_0_8px] [&_>_h3]:text-base [&_>_h3]:font-medium [&_>_h3]:leading-(--text-base--line-height) [&_>_p:not(.settings-description)]:m-0 [&_>_p:not(.settings-description)]:text-sm [&_>_p:not(.settings-description)]:leading-(--text-sm--line-height) [.settings-card_+_&]:mt-(--layout-section-gap) [.settings-row_+_&]:mt-(--layout-section-gap) [.sync-settings_&]:m-0 sync-disconnect flex flex-col gap-3"
          aria-label={t('connection.disconnect')}
        >
          <h3>{t('connection.disconnectChoice')}</h3>
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
          <div className="settings-actions [.settings-card_&]:mt-4 flex flex-wrap gap-2 [.sync-settings_&]:flex-wrap">
            <Button
              variant={runtime === 'desktop' ? 'default' : 'outline'}
              disabled={state.busy}
              onClick={() =>
                void run(async () => {
                  await connection.logout('keep');
                  setLogoutConfirm(false);
                }, t('connection.disconnectedKept'))
              }
              className={
                'h-(--control-height) bg-button-primary text-button-primary-foreground hover:bg-button-primary-hover'
              }
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
        <p className="sync-error m-0 text-sm text-destructive wrap-anywhere" role="alert">
          {syncError(t, localError || state.error || sync.error)}
        </p>
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
    <div className="sync-identity flex items-center gap-3 min-w-0 [&_>_div]:flex-1 [&_>_div]:min-w-0">
      {account.server ? (
        <Cloud className="size-4 inline-block shrink-0 align-middle" />
      ) : (
        <UserRound className="size-4 inline-block shrink-0 align-middle" />
      )}
      <div>
        <strong>{account.server ? account.name : t('profiles.guest')}</strong>
        <p className="settings-description [margin:4px_0_0] text-xs leading-(--text-xs--line-height) text-muted-foreground">
          {pending > 0 ? t('sync.statusPending', { status, count: pending }) : status}
        </p>
        {account.server && (
          <p className="settings-description [margin:4px_0_0] text-xs leading-(--text-xs--line-height) text-muted-foreground sync-server-address wrap-anywhere">
            {account.server.email} · {account.server.url}
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
