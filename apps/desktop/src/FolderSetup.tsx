import { createTranslations } from '@repo/frontend';
import { Button } from '@repo/ui/components/button';
import { invoke } from '@tauri-apps/api/core';
import { useState } from 'react';

export function FolderSetup({
  defaultPath,
  language,
}: {
  defaultPath: string;
  language: 'en' | 'ko';
}) {
  const [path, setPath] = useState(defaultPath);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [translations] = useState(() => createTranslations(language));
  const t = translations.t;

  async function choose() {
    setBusy(true);
    setError(false);
    try {
      const selected = await invoke<string | null>('data_directory_choose', {
        title: t('dataDirectory.choose'),
      });
      if (selected) {
        setPath(selected);
      }
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  async function open() {
    setBusy(true);
    setError(false);
    try {
      await invoke('data_directory_use', { path });
    } catch {
      setError(true);
      setBusy(false);
    }
  }

  return (
    <main lang={language} className="grid min-h-screen place-items-center p-6">
      <section aria-labelledby="folder-setup-title" className="w-full max-w-112 space-y-6">
        <header className="space-y-3">
          <img src="/icon.svg" alt="" className="size-12" />
          <h1 id="folder-setup-title" className="text-2xl font-semibold tracking-tight">
            {t('dataDirectory.setupTitle')}
          </h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            {t('dataDirectory.setupDescription')}
          </p>
        </header>
        <div className="space-y-2 rounded-lg border border-border p-4">
          <p className="text-xs font-medium text-muted-foreground">{t('dataDirectory.title')}</p>
          <p
            aria-label={t('dataDirectory.current')}
            className="select-text break-all text-sm leading-relaxed"
          >
            {path}
          </p>
        </div>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {t('dataDirectory.failed')}
          </p>
        )}
        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="outline" disabled={busy} onClick={() => void choose()}>
            {t('dataDirectory.choose')}
          </Button>
          <Button disabled={busy} onClick={() => void open()}>
            {t('dataDirectory.setupOpen')}
          </Button>
        </div>
        <p className="text-xs leading-relaxed text-muted-foreground">
          {t('dataDirectory.setupNote')}
        </p>
      </section>
    </main>
  );
}
