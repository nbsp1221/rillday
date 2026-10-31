import { createTranslations } from '@repo/frontend';
import { Button } from '@repo/ui/components/button';
import '@repo/ui/styles/globals.css';
import '@repo/ui/styles/fonts/desktop.css';
import { invoke } from '@tauri-apps/api/core';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { FolderSetup } from './FolderSetup';

const element = document.getElementById('root');
if (!element) {
  throw new Error('Missing application root');
}
const root = createRoot(element);
const language = navigator.language.startsWith('ko') ? 'ko' : 'en';
const dark = matchMedia('(prefers-color-scheme: dark)').matches;
document.documentElement.dataset.theme = dark ? 'dark' : 'light';
document.documentElement.classList.toggle('dark', dark);

async function start() {
  const defaultPath = await invoke<string | null>('data_directory_setup');
  if (defaultPath !== null) {
    root.render(
      <StrictMode>
        <FolderSetup defaultPath={defaultPath} language={language} />
      </StrictMode>,
    );
  } else {
    const { mountApplication } = await import('./application');
    mountApplication(root);
  }
}

void start().catch(() => {
  const t = createTranslations(language).t;
  root.render(
    <main lang={language} role="alert" className="mx-auto max-w-112 space-y-4 p-8">
      <h1 className="text-xl font-semibold">{t('startup.openFailed')}</h1>
      <p className="text-sm text-muted-foreground">{t('startup.dataPreserved')}</p>
      <Button variant="outline" onClick={() => location.reload()}>
        {t('common.retry')}
      </Button>
    </main>,
  );
});
