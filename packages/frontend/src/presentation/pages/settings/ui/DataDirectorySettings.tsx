import { Button } from '@repo/ui/components/button';
import { useEffect, useState } from 'react';
import type { DataDirectoryPort } from '#application';
import { useI18n } from '#shared/i18n';
import { WorkspaceDialog } from '#shared/ui/WorkspaceDialog';

export function DataDirectorySettings({ directory }: { directory: DataDirectoryPort }) {
  const { t } = useI18n();
  const [path, setPath] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    void directory.current().then(
      (value) => {
        if (active) {
          setPath(value);
        }
      },
      () => {
        if (active) {
          setError(true);
        }
      },
    );
    return () => {
      active = false;
    };
  }, [directory]);

  async function choose() {
    setBusy(true);
    setError(false);
    try {
      const candidate = await directory.choose(t('dataDirectory.choose'));
      if (candidate && candidate !== path) {
        setSelected(candidate);
      }
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  async function activate() {
    if (!selected) {
      return;
    }
    setBusy(true);
    setError(false);
    try {
      await directory.activate(selected);
    } catch {
      setError(true);
      setBusy(false);
    }
  }

  return (
    <section
      className="data-directory flex flex-col gap-3 border-t border-separator py-4"
      aria-label={t('dataDirectory.title')}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 className="m-0 text-sm font-medium">{t('dataDirectory.title')}</h3>
          <p className="mt-1 text-xs text-muted-foreground">{t('dataDirectory.description')}</p>
        </div>
        <Button
          className="h-(--control-height)"
          variant="outline"
          disabled={busy || !path}
          onClick={() => void choose()}
        >
          {t('dataDirectory.choose')}
        </Button>
      </div>
      <p className="m-0 select-text break-all text-sm" aria-label={t('dataDirectory.current')}>
        {path}
      </p>
      {error && !selected && (
        <p role="alert" className="text-sm text-destructive">
          {t('dataDirectory.failed')}
        </p>
      )}
      {selected && (
        <WorkspaceDialog
          title={t('dataDirectory.confirm')}
          description={t('dataDirectory.confirmDescription')}
          onClose={() => {
            if (!busy) {
              setSelected(null);
            }
          }}
          footer={
            <>
              <Button variant="outline" disabled={busy} onClick={() => setSelected(null)}>
                {t('common.cancel')}
              </Button>
              <Button disabled={busy} onClick={() => void activate()}>
                {t('dataDirectory.restart')}
              </Button>
            </>
          }
        >
          <p className="select-text break-all text-sm">{selected}</p>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {t('dataDirectory.failed')}
            </p>
          )}
        </WorkspaceDialog>
      )}
    </section>
  );
}
