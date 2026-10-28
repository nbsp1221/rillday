import { Button } from '@repo/ui/components/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@repo/ui/components/collapsible';
import { FieldDescription, FieldGroup } from '@repo/ui/components/field';
import { ChevronDown, ShieldCheck } from 'lucide-react';
import { useState, useSyncExternalStore } from 'react';
import type { ConnectionPort, WorkspaceProfile } from '#application';
import { useI18n } from '#shared/i18n';
import { type SyncActionRunner, preventComposition, validateForm } from '../model/sync-forms';
import { AccountFields, PasswordField } from './AccountFields';

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
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');

  if (!active || account.server?.role !== 'admin') {
    return null;
  }

  return (
    <section
      className="sync-administration flex min-w-0 flex-col gap-6 border-t pt-6"
      aria-label={t('auth.manageUsers')}
    >
      <div className="flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-sm font-medium">
          <ShieldCheck className="size-4 shrink-0" />
          {t('auth.manageUsers')}
        </h3>
        <Button
          variant="ghost"
          size="sm"
          disabled={state.busy}
          onClick={() => void run(() => connection.loadUsers())}
        >
          {t('auth.loadUsers')}
        </Button>
      </div>
      <FieldDescription>{t('auth.manageUsersDescription')}</FieldDescription>
      {state.users.length > 0 && (
        <ul className="sync-users m-0 list-none divide-y p-0">
          {state.users.map((user) => (
            <li key={user.id} className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0 space-y-1">
                <strong className="wrap-anywhere text-sm font-medium">{user.email}</strong>
                <p className="text-xs text-muted-foreground">
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
                  size="sm"
                  disabled={state.busy}
                  aria-label={t('auth.accountAction', {
                    email: user.email,
                    action: t(user.banned ? 'auth.enable' : 'auth.disable'),
                  })}
                  onClick={() => void run(() => connection.setUserDisabled(user.id, !user.banned))}
                >
                  {t(user.banned ? 'auth.enable' : 'auth.disable')}
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      <Collapsible>
        <CollapsibleTrigger
          render={<Button variant="ghost" className="group w-full justify-between" />}
        >
          {t('auth.addUser')}
          <ChevronDown className="size-4 transition-transform group-aria-expanded:rotate-180" />
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-6">
          <form
            className="flex flex-col gap-6"
            aria-label={t('auth.addUser')}
            noValidate
            onKeyDown={preventComposition}
            onSubmit={(event) => {
              event.preventDefault();
              if (!validateForm(event.currentTarget)) {
                return;
              }
              void run(async () => {
                await connection.createUser({ email: newEmail, password: newPassword });
                setNewEmail('');
                setNewPassword('');
              }, t('auth.userCreated'));
            }}
          >
            <FieldGroup className="gap-6">
              <AccountFields
                email={newEmail}
                onEmailChange={setNewEmail}
                password={newPassword}
                onPasswordChange={setNewPassword}
                newPassword
                disabled={state.busy}
              />
            </FieldGroup>
            <FieldDescription>{t('auth.initialPasswordDescription')}</FieldDescription>
            <Button
              type="submit"
              disabled={state.busy}
              className="h-(--control-height) w-full bg-button-primary text-button-primary-foreground hover:bg-button-primary-hover pointer-coarse:h-11"
            >
              {t('auth.createAccount')}
            </Button>
          </form>
        </CollapsibleContent>
      </Collapsible>
    </section>
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
  if (!active) {
    return null;
  }

  return (
    <Collapsible className="border-t pt-6">
      <CollapsibleTrigger
        render={<Button variant="ghost" className="group w-full justify-between" />}
      >
        {t('auth.changePassword')}
        <ChevronDown className="size-4 transition-transform group-aria-expanded:rotate-180" />
      </CollapsibleTrigger>
      <CollapsibleContent className="pt-6">
        <form
          className="flex flex-col gap-6"
          aria-label={t('auth.changePassword')}
          noValidate
          onKeyDown={preventComposition}
          onSubmit={(event) => {
            event.preventDefault();
            if (!validateForm(event.currentTarget)) {
              return;
            }
            void run(async () => {
              await connection.changePassword(currentPassword, replacementPassword);
              setCurrentPassword('');
              setReplacementPassword('');
            }, t('auth.passwordChanged'));
          }}
        >
          <FieldGroup className="gap-6">
            <PasswordField
              label={t('auth.currentPassword')}
              value={currentPassword}
              onChange={setCurrentPassword}
              newPassword={false}
              disabled={state.busy}
            />
            <PasswordField
              label={t('auth.newPassword')}
              value={replacementPassword}
              onChange={setReplacementPassword}
              newPassword
              disabled={state.busy}
            />
          </FieldGroup>
          <Button
            type="submit"
            disabled={state.busy}
            className="h-(--control-height) w-full bg-button-primary text-button-primary-foreground hover:bg-button-primary-hover pointer-coarse:h-11"
          >
            {t('auth.changePassword')}
          </Button>
        </form>
      </CollapsibleContent>
    </Collapsible>
  );
}
