import { Field as FormField } from '@base-ui/react/field';
import { Button } from '@repo/ui/components/button';
import { Input } from '@repo/ui/components/input';
import { type FormEvent, useState, useSyncExternalStore } from 'react';
import type { ConnectionPort } from '#application';
import { useI18n } from '#shared/i18n';
import { type SyncActionRunner, preventComposition } from '../model/sync-forms';

export function SyncLoginForm({
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
  const [email, setEmail] = useState(state.emailHint);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');

  function submit(event: FormEvent) {
    event.preventDefault();
    void run(async () => {
      const details = { email, password, ...(state.server?.setupRequired ? { name } : {}) };

      if (state.server?.setupRequired) {
        await connection.setup(details);
      } else {
        await connection.login(details);
      }

      setPassword('');
    });
  }

  return (
    <>
      {state.server && !active && !state.review && (
        <form
          className="form-stack flex flex-col gap-(--layout-form-gap) [&_p]:m-0 [&_p]:text-sm [&_p]:leading-(--text-sm--line-height) [&_p]:text-muted-foreground sync-login-form max-w-110"
          aria-label={t(
            state.server.setupRequired ? 'auth.setupAdministrator' : 'auth.serverSignIn',
          )}
          onKeyDown={preventComposition}
          onSubmit={submit}
          aria-busy={state.busy}
        >
          <div>
            <h3>
              {t(state.server.setupRequired ? 'auth.setupAdministrator' : 'auth.serverSignIn')}
            </h3>
            <p className="settings-description [margin:4px_0_0] text-xs leading-(--text-xs--line-height) text-muted-foreground">
              {t(state.server.setupRequired ? 'auth.setupDescription' : 'auth.signInDescription')}
            </p>
            {state.server.setupRequired && (
              <p className="settings-description [margin:4px_0_0] text-xs leading-(--text-xs--line-height) text-muted-foreground">
                {t('auth.setupWarning')}
              </p>
            )}
          </div>
          {state.server.setupRequired && (
            <FormField.Root className={'form-field flex min-w-0 flex-col gap-(--layout-field-gap)'}>
              <FormField.Label className="text-sm text-muted-foreground">
                {t('common.name')}
              </FormField.Label>
              <Input
                value={name}
                onChange={(event) => setName(event.target.value)}
                autoComplete="name"
                maxLength={80}
                required
                disabled={state.busy}
                className={
                  'h-(--control-height) border-control-border bg-card px-[9px] py-[7px] text-sm'
                }
              />
            </FormField.Root>
          )}
          <FormField.Root className={'form-field flex min-w-0 flex-col gap-(--layout-field-gap)'}>
            <FormField.Label className="text-sm text-muted-foreground">
              {t('auth.email')}
            </FormField.Label>
            <Input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="username"
              required
              disabled={state.busy}
              className={
                'h-(--control-height) border-control-border bg-card px-[9px] py-[7px] text-sm'
              }
            />
          </FormField.Root>
          <FormField.Root className={'form-field flex min-w-0 flex-col gap-(--layout-field-gap)'}>
            <FormField.Label className="text-sm text-muted-foreground">
              {t('auth.password')}
            </FormField.Label>
            <Input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete={state.server?.setupRequired ? 'new-password' : 'current-password'}
              minLength={state.server?.setupRequired ? 12 : undefined}
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
              {t(state.server.setupRequired ? 'auth.createAdministrator' : 'auth.signIn')}
            </Button>
          </div>
        </form>
      )}
    </>
  );
}
