import { Field as FormField } from '@base-ui/react/field';
import { Button } from '@repo/ui/components/button';
import { Input } from '@repo/ui/components/input';
import { ShieldCheck } from 'lucide-react';
import { useState, useSyncExternalStore } from 'react';
import type { ConnectionPort, WorkspaceProfile } from '#application';
import { useI18n } from '#shared/i18n';
import { type SyncActionRunner, preventComposition } from '../model/sync-forms';

export function SyncUserAdministration({
  connection,
  account,
  active,
  run,
}: {
  connection: ConnectionPort;
  account: WorkspaceProfile;
  active: boolean;
  run: SyncActionRunner;
}) {
  const { t } = useI18n();
  const state = useSyncExternalStore(connection.subscribe, connection.getSnapshot);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');

  return (
    <>
      {active && account.server?.role === 'admin' && (
        <section
          className="sync-administration flex flex-col gap-3"
          aria-label={t('auth.manageUsers')}
        >
          <div className="sync-section-title flex items-center justify-between gap-3 [&_h3]:flex [&_h3]:items-center [&_h3]:gap-2">
            <h3>
              <ShieldCheck className="size-3.5 inline-block shrink-0 align-middle" />
              {t('auth.manageUsers')}
            </h3>
            <Button
              variant="ghost"
              disabled={state.busy}
              onClick={() => void run(() => connection.loadUsers())}
              className={'h-(--control-height) text-muted-foreground hover:text-foreground'}
            >
              {t('auth.loadUsers')}
            </Button>
          </div>
          <p className="settings-description [margin:4px_0_0] text-xs leading-(--text-xs--line-height) text-muted-foreground">
            {t('auth.manageUsersDescription')}
          </p>
          {state.users.length > 0 && (
            <ul className="sync-users flex flex-col list-none m-0 p-0 [&_li]:flex [&_li]:items-center [&_li]:justify-between [&_li]:gap-3 [&_li]:py-3 [&_li]:px-0 [&_li]:[border-bottom:1px_solid_var(--separator)] [&_li_>_div]:min-w-0 [&_li_>_div]:wrap-anywhere [&_li_button]:shrink-0">
              {state.users.map((user) => (
                <li key={user.id}>
                  <div>
                    <strong>{user.name}</strong>
                    <p className="settings-description [margin:4px_0_0] text-xs leading-(--text-xs--line-height) text-muted-foreground">
                      {user.email} ·{' '}
                      {t(
                        user.role === 'admin'
                          ? 'auth.administrator'
                          : user.banned
                            ? 'auth.disabledAccount'
                            : 'auth.user',
                      )}
                    </p>
                  </div>
                  {user.role !== 'admin' && (
                    <Button
                      variant="outline"
                      disabled={state.busy}
                      aria-label={t('auth.accountAction', {
                        email: user.email,
                        action: t(user.banned ? 'auth.enable' : 'auth.disable'),
                      })}
                      onClick={() =>
                        void run(() => connection.setUserDisabled(user.id, !user.banned))
                      }
                      className={'h-(--control-height)'}
                    >
                      {t(user.banned ? 'auth.enable' : 'auth.disable')}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
          <details className="sync-details [&_>_form]:max-w-110 [border-top:1px_solid_var(--separator)] pt-4 [&_summary]:cursor-pointer [&_summary]:py-2 [&_summary]:px-0 [&_summary]:text-foreground [&_summary]:text-sm [&_>_form]:mt-3">
            <summary className="cursor-pointer focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2">
              {t('auth.addUser')}
            </summary>
            <form
              className="form-stack flex flex-col gap-(--layout-form-gap) [&_p]:m-0 [&_p]:text-sm [&_p]:leading-(--text-sm--line-height) [&_p]:text-muted-foreground"
              onKeyDown={preventComposition}
              onSubmit={(event) => {
                event.preventDefault();
                void run(async () => {
                  await connection.createUser({
                    name: newName,
                    email: newEmail,
                    password: newPassword,
                  });
                  setNewName('');
                  setNewEmail('');
                  setNewPassword('');
                }, t('auth.userCreated'));
              }}
            >
              <FormField.Root
                className={'form-field flex min-w-0 flex-col gap-(--layout-field-gap)'}
              >
                <FormField.Label className="text-sm text-muted-foreground">
                  {t('auth.userName')}
                </FormField.Label>
                <Input
                  value={newName}
                  onChange={(event) => setNewName(event.target.value)}
                  maxLength={80}
                  required
                  disabled={state.busy}
                  className={
                    'h-(--control-height) border-control-border bg-card px-[9px] py-[7px] text-sm'
                  }
                />
              </FormField.Root>
              <FormField.Root
                className={'form-field flex min-w-0 flex-col gap-(--layout-field-gap)'}
              >
                <FormField.Label className="text-sm text-muted-foreground">
                  {t('auth.userEmail')}
                </FormField.Label>
                <Input
                  type="email"
                  value={newEmail}
                  onChange={(event) => setNewEmail(event.target.value)}
                  required
                  disabled={state.busy}
                  className={
                    'h-(--control-height) border-control-border bg-card px-[9px] py-[7px] text-sm'
                  }
                />
              </FormField.Root>
              <FormField.Root
                className={'form-field flex min-w-0 flex-col gap-(--layout-field-gap)'}
              >
                <FormField.Label className="text-sm text-muted-foreground">
                  {t('auth.initialPassword')}
                </FormField.Label>
                <Input
                  type="password"
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  autoComplete="new-password"
                  minLength={12}
                  maxLength={128}
                  required
                  disabled={state.busy}
                  className={
                    'h-(--control-height) border-control-border bg-card px-[9px] py-[7px] text-sm'
                  }
                />
              </FormField.Root>
              <p className="settings-description [margin:4px_0_0] text-xs leading-(--text-xs--line-height) text-muted-foreground">
                {t('auth.initialPasswordDescription')}
              </p>
              <div className="settings-actions [.settings-card_&]:mt-4 flex flex-wrap gap-2 [.sync-settings_&]:flex-wrap">
                <Button
                  type="submit"
                  disabled={state.busy}
                  className={
                    'h-(--control-height) bg-button-primary text-button-primary-foreground hover:bg-button-primary-hover'
                  }
                >
                  {t('auth.createAccount')}
                </Button>
              </div>
            </form>
          </details>
        </section>
      )}
    </>
  );
}

export function SyncPasswordForm({
  connection,
  active,
  run,
}: {
  connection: ConnectionPort;
  active: boolean;
  run: SyncActionRunner;
}) {
  const { t } = useI18n();
  const state = useSyncExternalStore(connection.subscribe, connection.getSnapshot);
  const [currentPassword, setCurrentPassword] = useState('');
  const [replacementPassword, setReplacementPassword] = useState('');

  return (
    <>
      {active && (
        <details className="sync-details [&_>_form]:max-w-110 [border-top:1px_solid_var(--separator)] pt-4 [&_summary]:cursor-pointer [&_summary]:py-2 [&_summary]:px-0 [&_summary]:text-foreground [&_summary]:text-sm [&_>_form]:mt-3">
          <summary className="cursor-pointer focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2">
            {t('auth.changePassword')}
          </summary>
          <form
            className="form-stack flex flex-col gap-(--layout-form-gap) [&_p]:m-0 [&_p]:text-sm [&_p]:leading-(--text-sm--line-height) [&_p]:text-muted-foreground"
            onKeyDown={preventComposition}
            onSubmit={(event) => {
              event.preventDefault();
              void run(async () => {
                await connection.changePassword(currentPassword, replacementPassword);
                setCurrentPassword('');
                setReplacementPassword('');
              }, t('auth.passwordChanged'));
            }}
          >
            <FormField.Root className={'form-field flex min-w-0 flex-col gap-(--layout-field-gap)'}>
              <FormField.Label className="text-sm text-muted-foreground">
                {t('auth.currentPassword')}
              </FormField.Label>
              <Input
                type="password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                autoComplete="current-password"
                required
                disabled={state.busy}
                className={
                  'h-(--control-height) border-control-border bg-card px-[9px] py-[7px] text-sm'
                }
              />
            </FormField.Root>
            <FormField.Root className={'form-field flex min-w-0 flex-col gap-(--layout-field-gap)'}>
              <FormField.Label className="text-sm text-muted-foreground">
                {t('auth.newPassword')}
              </FormField.Label>
              <Input
                type="password"
                value={replacementPassword}
                onChange={(event) => setReplacementPassword(event.target.value)}
                autoComplete="new-password"
                minLength={12}
                maxLength={128}
                required
                disabled={state.busy}
                className={
                  'h-(--control-height) border-control-border bg-card px-[9px] py-[7px] text-sm'
                }
              />
            </FormField.Root>
            <div className="settings-actions [.settings-card_&]:mt-4 flex flex-wrap gap-2 [.sync-settings_&]:flex-wrap">
              <Button
                type="submit"
                disabled={state.busy}
                className={
                  'h-(--control-height) bg-button-primary text-button-primary-foreground hover:bg-button-primary-hover'
                }
              >
                {t('auth.changePassword')}
              </Button>
            </div>
          </form>
        </details>
      )}
    </>
  );
}
