import { Field as FormField } from '@base-ui/react/field';
import { Button } from '@repo/ui/components/button';
import { Textarea } from '@repo/ui/components/textarea';
import { useState, useSyncExternalStore } from 'react';
import type { ConnectionPort, RecoveredInput, WorkspacePort } from '#application';
import { useAppPreferences } from '#entities/preferences';
import { useI18n } from '#shared/i18n';
import { WorkspaceDialog } from '#shared/ui/WorkspaceDialog';
import type { SyncActionRunner } from '../model/sync-forms';
import { syncError } from '../../../shared/lib/operation-errors';
import { formatChange, formatLabel } from '../model/conflict-formatting';

export function SyncBackupRecovery({
  connection,
  run,
}: {
  connection: ConnectionPort;
  run: SyncActionRunner;
}) {
  const { t } = useI18n();
  const { preferences } = useAppPreferences();
  const state = useSyncExternalStore(connection.subscribe, connection.getSnapshot);
  const [recoveredInputs, setRecoveredInputs] = useState<RecoveredInput[] | null>(null);

  return (
    <>
      {Boolean(state.backups?.length) && (
        <details className="sync-details [&_>_form]:max-w-110 [border-top:1px_solid_var(--separator)] pt-4 [&_summary]:cursor-pointer [&_summary]:py-2 [&_summary]:px-0 [&_summary]:text-foreground [&_summary]:text-sm [&_>_form]:mt-3">
          <summary className="cursor-pointer focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2">
            {t('recovery.title')}
          </summary>
          <p className="settings-description [margin:4px_0_0] text-xs leading-(--text-xs--line-height) text-muted-foreground">
            {t('recovery.description')}
          </p>
          {state.backups?.map((backup) => (
            <div
              className="sync-backup flex justify-between items-center gap-3 py-3 text-xs [@media(max-width:_640px)]:flex-wrap"
              key={backup.id}
            >
              <span>
                {t(
                  backup.reason === 'draft' ? 'recovery.unsavedEdits' : 'recovery.beforeConnection',
                )}
                {backup.name ? ' · ' + backup.name : ''} ·{' '}
                {t('backup.createdAt', {
                  createdAt: new Date(backup.createdAt),
                  formatParams: {
                    createdAt: {
                      year: 'numeric',
                      month: 'numeric',
                      day: 'numeric',
                      hour: 'numeric',
                      hour12: preferences.timeFormat === '12h',
                      minute: '2-digit',
                      second: '2-digit',
                    },
                  },
                })}{' '}
                ·{' '}
                {t('backup.taskHabitSummary', {
                  tasks: backup.contents.tasks,
                  habits: backup.contents.habits,
                })}
                {backup.drafts ? ' · ' + t('recovery.inputCount', { count: backup.drafts }) : ''}
              </span>
              {Boolean(backup.drafts) && (
                <Button
                  variant="ghost"
                  onClick={() =>
                    void run(async () => {
                      setRecoveredInputs(await connection.recoverInputs(backup.id));
                    })
                  }
                  className={'h-(--control-height) text-muted-foreground hover:text-foreground'}
                >
                  {t('recovery.viewInputs')}
                </Button>
              )}
              <Button
                variant="outline"
                onClick={() =>
                  void run(async () => {
                    const source = await connection.downloadConnectionBackup(backup.id);
                    const url = URL.createObjectURL(
                      new Blob([source], { type: 'application/json' }),
                    );
                    const anchor = document.createElement('a');
                    anchor.href = url;
                    anchor.download = 'rillday-before-connection.json';
                    anchor.click();
                    setTimeout(() => URL.revokeObjectURL(url), 1000);
                  })
                }
                className={'h-(--control-height)'}
              >
                {t('backup.download')}
              </Button>
            </div>
          ))}
        </details>
      )}
      {recoveredInputs && (
        <WorkspaceDialog
          title={t('recovery.savedInputs')}
          onClose={() => setRecoveredInputs(null)}
          description={t('recovery.copyHint')}
        >
          <div className="form-stack flex flex-col gap-(--layout-form-gap) [&_p]:m-0 [&_p]:text-sm [&_p]:leading-(--text-sm--line-height) [&_p]:text-muted-foreground sync-recovered-inputs max-h-[55vh] overflow-auto [&::-webkit-scrollbar]:size-[7px] [&::-webkit-scrollbar-thumb]:rounded-lg [&::-webkit-scrollbar-thumb]:bg-scrollbar [&::-webkit-scrollbar-thumb:hover]:bg-scrollbar-hover [&_textarea]:w-full [&_textarea]:resize-y">
            {recoveredInputs.map(({ key, text }, index) => (
              <FormField.Root
                key={key}
                className={'form-field flex min-w-0 flex-col gap-(--layout-field-gap)'}
              >
                <FormField.Label className="text-sm text-muted-foreground">
                  {t('recovery.inputNumber', { number: index + 1 })}
                </FormField.Label>
                <FormField.Control render={<Textarea readOnly value={text} rows={3} />} />
              </FormField.Root>
            ))}
          </div>
        </WorkspaceDialog>
      )}
    </>
  );
}

export function SyncConflicts({
  connection,
  workspace,
  run,
}: {
  connection: ConnectionPort;
  workspace: WorkspacePort;
  run: SyncActionRunner;
}) {
  const { t, weekdayNames } = useI18n();
  const state = useSyncExternalStore(connection.subscribe, connection.getSnapshot);
  const sync = useSyncExternalStore(workspace.subscribe, workspace.getSnapshot);

  return (
    <>
      {Boolean(sync.issues.length) && (
        <section className="sync-conflicts flex flex-col gap-3" aria-label={t('conflicts.title')}>
          <h3>{t('conflicts.title')}</h3>
          <p className="settings-description [margin:4px_0_0] text-xs leading-(--text-xs--line-height) text-muted-foreground">
            {t('conflicts.description')}
          </p>
          {sync.issues.map((issue) => (
            <div
              className="settings-card p-(--layout-card-inset) rounded-lg bg-surface-inset [&_>_h3]:[margin:0_0_8px] [&_>_h3]:text-base [&_>_h3]:font-medium [&_>_h3]:leading-(--text-base--line-height) [&_>_p:not(.settings-description)]:m-0 [&_>_p:not(.settings-description)]:text-sm [&_>_p:not(.settings-description)]:leading-(--text-sm--line-height) [.settings-card_+_&]:mt-(--layout-section-gap) [.settings-row_+_&]:mt-(--layout-section-gap) [.sync-settings_&]:m-0 sync-conflict"
              key={issue.id}
            >
              <strong>{formatLabel(issue.title, t, weekdayNames)}</strong>
              <p className="settings-description [margin:4px_0_0] text-xs leading-(--text-xs--line-height) text-muted-foreground">
                {syncError(t, issue.code)}
              </p>
              <div
                data-single={issue.choices.length === 1 || undefined}
                className="sync-comparison grid grid-cols-[repeat(2,_minmax(0,_1fr))] data-[single=true]:grid-cols-1 gap-3 my-3 mx-0 [&_label]:min-w-0 [&_label]:flex [&_label]:flex-col [&_label]:gap-2 [&_label]:text-xs [&_label]:text-muted-foreground [&_textarea]:w-full [&_textarea]:resize-y [&_textarea]:min-h-24 [&_textarea]:max-h-60 [@media(max-width:_640px)]:grid-cols-[minmax(0,_1fr)]"
              >
                {issue.choices.map((choice, index) => (
                  <label key={choice.id}>
                    {t(
                      issue.choices.length === 1 ? 'conflicts.availableChoice' : 'conflicts.option',
                      { number: index + 1 },
                    )}
                    <Textarea
                      readOnly
                      aria-label={t(
                        issue.choices.length === 1
                          ? 'conflicts.availableChoice'
                          : 'conflicts.option',
                        { number: index + 1 },
                      )}
                      value={formatChange(choice.description, t, weekdayNames)}
                      rows={4}
                    />
                  </label>
                ))}
              </div>
              <div className="settings-actions [.settings-card_&]:mt-4 flex flex-wrap gap-2 [.sync-settings_&]:flex-wrap">
                {issue.choices.map((choice, index) => (
                  <Button
                    key={choice.id}
                    variant={issue.choices.length === 1 ? 'default' : 'outline'}
                    disabled={state.busy}
                    onClick={() => void run(() => workspace.resolve(issue.id, choice.id))}
                    className={
                      'h-(--control-height) bg-button-primary text-button-primary-foreground hover:bg-button-primary-hover'
                    }
                  >
                    {t(issue.choices.length === 1 ? 'conflicts.confirm' : 'conflicts.keepChoice', {
                      number: index + 1,
                    })}
                  </Button>
                ))}
              </div>
            </div>
          ))}
        </section>
      )}
    </>
  );
}
