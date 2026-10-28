import { Button } from '@repo/ui/components/button';
import { FieldGroup } from '@repo/ui/components/field';
import { LoaderCircle } from 'lucide-react';
import { type FormEvent, useState, useSyncExternalStore } from 'react';
import type { ConnectionPort } from '#application';
import { useI18n } from '#shared/i18n';
import { type SyncActionRunner, preventComposition, validateForm } from '../model/sync-forms';
import { AccountFields } from './AccountFields';

export function SyncLoginForm({
  connection,
  run,
}: {
  connection: ConnectionPort;
  run: SyncActionRunner;
}) {
  const { t } = useI18n();
  const state = useSyncExternalStore(connection.subscribe, connection.getSnapshot);
  const [email, setEmail] = useState(state.emailHint);
  const [password, setPassword] = useState('');

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!validateForm(event.currentTarget)) {
      return;
    }
    void run(async () => {
      const details = { email, password };

      if (state.server?.setupRequired) {
        await connection.setup(details);
      } else {
        await connection.login(details);
      }

      setPassword('');
    });
  }

  if (!state.server || state.review) {
    return null;
  }

  return (
    <form
      className="sync-login-form flex min-w-0 flex-col gap-6"
      noValidate
      aria-label={t(state.server.setupRequired ? 'auth.setupAdministrator' : 'auth.serverSignIn')}
      onKeyDown={preventComposition}
      onSubmit={submit}
      aria-busy={state.busy}
    >
      <div className="space-y-2">
        <h3 className="text-base font-semibold">
          {t(state.server.setupRequired ? 'auth.setupAdministrator' : 'auth.serverSignIn')}
        </h3>
        <p className="text-sm text-muted-foreground">
          {t(state.server.setupRequired ? 'auth.setupDescription' : 'auth.signInDescription')}
        </p>
        {state.server.setupRequired && (
          <p className="text-sm text-muted-foreground">{t('auth.setupWarning')}</p>
        )}
      </div>
      <FieldGroup className="gap-6">
        <AccountFields
          email={email}
          onEmailChange={setEmail}
          password={password}
          onPasswordChange={setPassword}
          newPassword={state.server.setupRequired}
          disabled={state.busy}
        />
      </FieldGroup>
      <div>
        <Button
          type="submit"
          disabled={state.busy}
          className={
            'h-(--control-height) w-full bg-button-primary text-button-primary-foreground hover:bg-button-primary-hover pointer-coarse:h-11'
          }
        >
          {state.busy && <LoaderCircle className="animate-spin" />}
          {t(state.server.setupRequired ? 'auth.createAdministrator' : 'auth.signIn')}
        </Button>
      </div>
    </form>
  );
}
