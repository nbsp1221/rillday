import { Button } from '@repo/ui/components/button';
import { type ChangeEvent, useRef, useState } from 'react';
import { type WorkspacePort, dateKey } from '#application';
import { useI18n } from '#shared/i18n';
import { WorkspaceDialog } from '#shared/ui/WorkspaceDialog';
import { syncError } from '../../../shared/lib/operation-errors';

interface PendingImport {
  source: string;
  tasks: number;
  habits: number;
}

export function useWorkspaceBackup({
  workspace,
  notify,
  onInspect,
  onImported,
}: {
  workspace: WorkspacePort;
  notify: (message: string) => void;
  onInspect: () => void;
  onImported: () => void;
}) {
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<PendingImport | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function exportBackup() {
    try {
      const blob = new Blob([await workspace.exportData()], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `rillday-${dateKey()}.json`;

      try {
        anchor.click();
      } finally {
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }

      notify(t('backup.exported'));
    } catch (error) {
      notify(error instanceof Error ? syncError(t, error.message) : t('operations.saveFailed'));
    }
  }

  async function inspect(file: File) {
    try {
      const source = await file.text();
      const counts = workspace.inspectImport(source);
      onInspect();
      setPending({ source, ...counts });
      setError('');
    } catch (error) {
      notify(error instanceof Error ? syncError(t, error.message) : t('backup.readFailed'));
    }
  }

  function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = '';

    if (file) {
      void inspect(file);
    }
  }

  async function importBackup() {
    if (!pending || busy) {
      return;
    }

    setBusy(true);
    setError('');

    try {
      await workspace.importData(pending.source);
      setPending(null);
      onImported();
      notify(t('backup.imported'));
    } catch (error) {
      setError(error instanceof Error ? syncError(t, error.message) : t('operations.importFailed'));
    } finally {
      setBusy(false);
    }
  }

  return {
    inputRef,
    pending,
    busy,
    error,
    chooseFile,
    exportData: () => {
      void exportBackup();
    },
    openImport: () => inputRef.current?.click(),
    confirm: () => {
      void importBackup();
    },
    close: () => setPending(null),
  };
}

export function WorkspaceBackupDialogs({
  backup,
}: {
  backup: ReturnType<typeof useWorkspaceBackup>;
}) {
  const { t } = useI18n();
  const { inputRef, chooseFile, pending, close, busy, confirm, error } = backup;

  return (
    <>
      <input
        ref={inputRef}
        hidden
        type="file"
        accept=".json,application/json"
        onChange={chooseFile}
      />
      {pending && (
        <WorkspaceDialog
          title={t('backup.import')}
          onClose={close}
          footer={
            <>
              <Button variant="outline" onClick={close} className={'h-(--control-height) min-w-18'}>
                {t('common.cancel')}
              </Button>
              <Button
                disabled={busy}
                onClick={confirm}
                className={
                  'h-(--control-height) min-w-18 bg-button-primary text-button-primary-foreground hover:bg-button-primary-hover'
                }
              >
                {t('common.import')}
              </Button>
            </>
          }
          description={t('backup.replaceConfirmation', {
            tasks: pending.tasks,
            habits: pending.habits,
          })}
        >
          <p className="muted [.modal-body_>_&]:m-0 [.modal-body_>_&]:text-sm [.modal-body_>_&]:leading-(--text-sm--line-height) [.modal-body_>_&]:text-muted-foreground text-muted-foreground">
            {t('backup.replaceWarning')}
          </p>
          {error && (
            <p role="alert" className="sync-error m-0 text-sm text-destructive wrap-anywhere">
              {error}
            </p>
          )}
        </WorkspaceDialog>
      )}
    </>
  );
}
