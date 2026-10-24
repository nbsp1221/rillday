import { type ReactNode, createContext, use, useEffect } from 'react';
import type { AppPreferences } from '#application';
import { I18nProvider } from '#shared/i18n';
import { usePreferences } from './use-preferences';
const PreferencesContext = createContext<ReturnType<typeof usePreferences> | null>(null);

export function PreferencesProvider({
  initial,
  persist,
  children,
}: {
  initial: AppPreferences;
  persist: (patch: Partial<AppPreferences>) => Promise<void>;
  children: ReactNode;
}) {
  const state = usePreferences(initial, persist);
  const { preferences, preferenceSaveState } = state;
  useEffect(() => {
    const media = matchMedia('(prefers-color-scheme: dark)');

    const apply = () => {
      const resolved =
        preferences.theme === 'system' ? (media.matches ? 'dark' : 'light') : preferences.theme;
      document.documentElement.dataset.theme = resolved;
      document.documentElement.classList.toggle('dark', resolved === 'dark');
      document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute('content', resolved === 'dark' ? '#171717' : '#ffffff');
    };

    apply();
    media.addEventListener('change', apply);
    return () => media.removeEventListener('change', apply);
  }, [preferences.theme]);
  useEffect(() => {
    document.documentElement.lang = preferences.language;
    document.documentElement.dataset.density = preferences.density;
  }, [preferences.language, preferences.density]);
  useEffect(() => {
    if (preferenceSaveState === 'saved') {
      return;
    }

    const guard = (event: BeforeUnloadEvent) => event.preventDefault();

    window.addEventListener('beforeunload', guard);
    return () => window.removeEventListener('beforeunload', guard);
  }, [preferenceSaveState]);

  return (
    <PreferencesContext value={state}>
      <I18nProvider
        language={preferences.language}
        timeFormat={preferences.timeFormat}
        weekStartsOn={preferences.weekStartsOn}
      >
        {children}
      </I18nProvider>
    </PreferencesContext>
  );
}

export function useAppPreferences() {
  const value = use(PreferencesContext);
  if (!value) {
    throw new Error('Missing preferences provider');
  }
  return value;
}
