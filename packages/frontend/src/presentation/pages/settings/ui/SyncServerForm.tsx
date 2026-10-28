import { Button } from '@repo/ui/components/button';
import { Field, FieldDescription, FieldError, FieldLabel } from '@repo/ui/components/field';
import { Input } from '@repo/ui/components/input';
import { LoaderCircle } from 'lucide-react';
import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import type { ConnectionPort } from '#application';
import { useI18n } from '#shared/i18n';
import { type SyncActionRunner, preventComposition, validateForm } from '../model/sync-forms';
import { SyncLoginForm } from './SyncLoginForm';

export function SyncServerForm({
  connection,
  active,
  suggestedServerUrl,
  run,
}: {
  connection: ConnectionPort;
  active: boolean;
  suggestedServerUrl?: string;
  run: SyncActionRunner;
}) {
  const { t } = useI18n();
  const state = useSyncExternalStore(connection.subscribe, connection.getSnapshot);
  const id = useId();
  const [url, setUrl] = useState(state.serverUrl || suggestedServerUrl || '');
  const [editing, setEditing] = useState(!(state.serverUrl || suggestedServerUrl));
  const [error, setError] = useState('');
  const checkingRef = useRef(false);
  const check = useCallback(
    async (target: string) => {
      if (checkingRef.current) {
        return;
      }
      // The coordinator becomes idle before the UI's failure handling completes.
      checkingRef.current = true;
      try {
        await run(async () => {
          try {
            await connection.checkServer(target);
            setUrl(connection.getSnapshot().serverUrl);
            setEditing(false);
          } catch (failure) {
            setEditing(true);
            throw failure;
          }
        });
      } finally {
        checkingRef.current = false;
      }
    },
    [connection, run],
  );

  useEffect(() => {
    const current = connection.getSnapshot();
    const target = current.serverUrl || suggestedServerUrl;
    if (!active && !editing && !current.review && !current.server && !current.busy && target) {
      void check(target);
    }
  }, [
    active,
    check,
    connection,
    editing,
    suggestedServerUrl,
    state.busy,
    state.server,
    state.review,
  ]);

  if (active || state.review) {
    return null;
  }

  const showEditor = editing || !(state.serverUrl || suggestedServerUrl);
  return (
    <div className="flex min-w-0 flex-col gap-6">
      {showEditor ? (
        <form
          className="sync-server-form flex min-w-0 flex-col gap-6"
          aria-label={t('connection.connectServer')}
          aria-busy={state.busy}
          noValidate
          onKeyDown={preventComposition}
          onSubmit={(event) => {
            event.preventDefault();
            if (validateForm(event.currentTarget)) {
              void check(url);
            }
          }}
        >
          <Field className="gap-2" data-invalid={Boolean(error)}>
            <FieldLabel htmlFor={id}>{t('connection.serverUrl')}</FieldLabel>
            <Input
              id={id}
              name="server-url"
              type="url"
              value={url}
              onChange={(event) => {
                setError('');
                setUrl(event.target.value);
              }}
              onInvalid={(event) => {
                event.preventDefault();
                setError(
                  t(
                    event.currentTarget.validity.valueMissing
                      ? 'auth.requiredField'
                      : 'connection.invalidAddress',
                  ),
                );
              }}
              placeholder="https://rillday.example.com"
              inputMode="url"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              autoComplete="url"
              required
              disabled={state.busy}
              aria-invalid={Boolean(error)}
              aria-describedby={`${id}-help${error ? ` ${id}-error` : ''}`}
              className="h-(--control-height) pointer-coarse:h-11"
            />
            <FieldDescription id={`${id}-help`}>
              {t('connection.serverAddressHelp')}
            </FieldDescription>
            {error && <FieldError id={`${id}-error`}>{error}</FieldError>}
          </Field>
          <Button
            type="submit"
            disabled={state.busy}
            className="h-(--control-height) w-full pointer-coarse:h-11"
          >
            {state.busy && <LoaderCircle className="animate-spin" />}
            {t(state.busy ? 'connection.checking' : 'connection.check')}
          </Button>
        </form>
      ) : state.server ? (
        <>
          <div className="sync-server-summary flex min-w-0 items-start justify-between gap-3 border-b pb-4">
            <div className="min-w-0 space-y-1">
              <p className="text-xs text-muted-foreground">{t('connection.verifiedServer')}</p>
              <p className="wrap-anywhere text-sm font-medium">{state.serverUrl}</p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={state.busy}
              onClick={() => setEditing(true)}
              className="shrink-0 pointer-coarse:h-11"
            >
              {t('connection.changeServer')}
            </Button>
          </div>
          {state.serverUrl.startsWith('http:') &&
            !/^http:\/\/(localhost|127\.0\.0\.1|\[::1\])(?::|\/|$)/.test(state.serverUrl) && (
              <p className="text-sm text-muted-foreground" role="note">
                {t('connection.insecureWarning')}
              </p>
            )}
          <SyncLoginForm key={state.serverUrl} connection={connection} run={run} />
        </>
      ) : (
        <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
          <LoaderCircle className="size-4 animate-spin" />
          {t('connection.checking')}
        </p>
      )}
    </div>
  );
}
