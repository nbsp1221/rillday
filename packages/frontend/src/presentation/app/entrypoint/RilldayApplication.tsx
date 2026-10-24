import { Button } from '@repo/ui/components/button';
import { type ComponentType, type ReactNode, useMemo, useSyncExternalStore } from 'react';
import type { Application, HostRuntime } from '#application';
import { PreferencesProvider } from '../../entities/preferences';
import { createTranslations } from '../../shared/i18n';
import { useConnectionFocus } from '../model/use-connection-focus';
import { RilldayApp } from './RilldayApp';
import { useApplicationStartup } from './use-application-startup';

function ConnectedApp({
  application,
  runtime,
  version,
  navigationFooter,
}: {
  application: Application;
  runtime: HostRuntime;
  version: string;
  navigationFooter?: ReactNode;
}) {
  const state = useSyncExternalStore(application.subscribe, application.getSnapshot);
  return (
    <RilldayApp
      key={state.resetIdentity}
      workspace={state.workspace}
      connection={state.connection}
      settingsRequest={state.settingsRequest}
      accounts={state.accounts}
      activeAccountId={state.activeId}
      runtime={runtime}
      version={version}
      navigationFooter={navigationFooter}
      renameAccount={application.renameAccount}
    />
  );
}

export interface HostLifecycleProps {
  application: Application | undefined;
  reportError: (code: string) => void;
}

export function RilldayApplication({
  application,
  runtime,
  version,
  Lifecycle,
  children,
  navigationFooter,
}: {
  runtime: HostRuntime;
  version: string;
  application: Application;
  Lifecycle?: ComponentType<HostLifecycleProps>;
  children?: (application: Application) => ReactNode;
  navigationFooter?: ReactNode;
}) {
  const { ready, error, language, reportError, persistPreferences } =
    useApplicationStartup(application);
  useConnectionFocus(ready?.application.connection);

  const t = useMemo(() => createTranslations(language).t, [language]);

  let content: ReactNode;
  if (error) {
    content = (
      <main
        lang={language}
        className="startup-state max-w-125 my-[20vh] mx-auto p-8 [&_h1]:text-2xl [&_h1]:leading-(--text-2xl--line-height) [&_p]:text-muted-foreground [&_p]:text-sm [&_p]:leading-(--text-sm--line-height)"
        role="alert"
      >
        <h1>{t('startup.openFailed')}</h1>
        <p>
          {t(error, {
            ns: ['errors', 'translation'],
            defaultValue: t('startup.storageUnavailable'),
          })}
        </p>
        <p>{t('startup.dataPreserved')}</p>
        <Button variant="outline" onClick={() => location.reload()}>
          {t('common.retry')}
        </Button>
      </main>
    );
  } else if (!ready) {
    content = (
      <main
        lang={language}
        className="startup-state max-w-125 my-[20vh] mx-auto p-8 [&_h1]:text-2xl [&_h1]:leading-(--text-2xl--line-height) [&_p]:text-muted-foreground [&_p]:text-sm [&_p]:leading-(--text-sm--line-height)"
      >
        <h1>Rillday</h1>
        <p>{t('startup.opening')}</p>
      </main>
    );
  } else {
    content = (
      <PreferencesProvider initial={ready.preferences} persist={persistPreferences}>
        <ConnectedApp
          application={ready.application}
          runtime={runtime}
          version={version}
          navigationFooter={navigationFooter}
        />
        {children?.(ready.application)}
      </PreferencesProvider>
    );
  }
  return (
    <>
      {Lifecycle && <Lifecycle application={ready?.application} reportError={reportError} />}
      {content}
    </>
  );
}
