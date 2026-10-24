import { useCallback, useEffect, useRef, useState } from 'react';
import type { AppPreferences, Application } from '#application';

interface ReadyAccount {
  application: Application;
  preferences: AppPreferences;
}

interface AccountResources {
  application: Application;
  preferences: Promise<AppPreferences>;
  loaded: Promise<ReadyAccount>;
  generation: number;
}

function createResources(application: Application): AccountResources {
  const preferences = application.preferences.loadPreferences();

  return {
    application,
    preferences,
    loaded: Promise.all([application.initialize(), preferences]).then(([, preferences]) => ({
      application,
      preferences,
    })),
    generation: 0,
  };
}

export function useApplicationStartup(application: Application) {
  const [ready, setReady] = useState<ReadyAccount | null>(null);
  const [error, setError] = useState('');
  const [language, setLanguage] = useState<AppPreferences['language']>('en');
  const resourcesRef = useRef<AccountResources | null>(null);

  useEffect(() => {
    let stopped = false;
    resourcesRef.current ??= createResources(application);
    const resource = resourcesRef.current;
    const generation = ++resource.generation;
    // Workspace failure must not discard a successfully loaded language preference.
    void resource.preferences.then(
      (preferences) => {
        if (!stopped) {
          setLanguage(preferences.language);
        }
      },
      () => undefined,
    );
    void resource.loaded.then(
      (value) => {
        if (!stopped) {
          setReady(value);
        }
      },
      (reason: unknown) => {
        if (!stopped) {
          setError(reason instanceof Error ? reason.message : 'startup.storageUnavailable');
        }
      },
    );

    return () => {
      stopped = true;
      // A Strict Mode effect replay reuses resources before this microtask runs.
      queueMicrotask(() => {
        if (resource.generation === generation) {
          void resource.application.dispose().catch(() => {
            globalThis.dispatchEvent(new Event('rillday-close-save-error'));
          });
        }
      });
    };
  }, [application]);

  const persistPreferences = useCallback(
    (preferences: Partial<AppPreferences>) => {
      if (!ready) {
        return Promise.reject(new Error('Workspace is not ready'));
      }

      return ready.application.preferences.savePreferences(preferences).then(() => {
        if (preferences.language) {
          setLanguage(preferences.language);
        }
      });
    },
    [ready],
  );

  return { ready, error, language, reportError: setError, persistPreferences };
}
