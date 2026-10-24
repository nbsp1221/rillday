import { Button } from '@repo/ui/components/button';
import { Input } from '@repo/ui/components/input';
import { useWorkspace } from '#entities/workspace';
import { useI18n } from '#shared/i18n';
import { WorkspaceChoiceField } from '#shared/ui/WorkspaceChoice';
import { WorkspaceColorField } from '#shared/ui/WorkspaceColorField';
import { WorkspaceDialog } from '#shared/ui/WorkspaceDialog';

export function MatrixSettings({ close }: { close: () => void }) {
  const { t } = useI18n();
  const { data, apply } = useWorkspace();
  const mode = data.matrixMode ?? 'simple';

  return (
    <WorkspaceDialog
      title={t('matrix.settings')}
      onClose={close}
      footer={
        <>
          <Button
            onClick={close}
            className={
              'h-(--control-height) min-w-18 bg-button-primary text-button-primary-foreground hover:bg-button-primary-hover'
            }
          >
            {t('common.complete')}
          </Button>
        </>
      }
    >
      <div className="form-stack flex flex-col gap-(--layout-form-gap) [&_p]:m-0 [&_p]:text-sm [&_p]:leading-(--text-sm--line-height) [&_p]:text-muted-foreground">
        <WorkspaceChoiceField
          label={t('common.grouping')}
          value={mode}
          options={[
            { value: 'simple', label: t('tasks.priority') },
            { value: 'complex', label: t('matrix.importanceAndDate') },
          ]}
          onChange={(value) => apply({ type: 'matrix.mode', mode: value })}
        />
        <p className="muted [.modal-body_>_&]:m-0 [.modal-body_>_&]:text-sm [.modal-body_>_&]:leading-(--text-sm--line-height) [.modal-body_>_&]:text-muted-foreground text-muted-foreground">
          {mode === 'simple' ? t('matrix.priorityHelp') : t('matrix.importanceHelp')}
        </p>
        {data.quadrants.map((quadrant) => (
          <div
            key={quadrant.id}
            className="quadrant-setting [.form-stack_&]:flex [.form-stack_&]:flex-row [.form-stack_&]:gap-2 [&_>_input]:flex-1 [&_>_input]:min-w-0"
          >
            <WorkspaceColorField
              compact
              label={t('matrix.quadrantColor', { v0: quadrant.id })}
              value={quadrant.color}
              onChange={(color) => {
                if (color) {
                  apply({ type: 'quadrant.update', id: quadrant.id, patch: { color } });
                }
              }}
            />
            <Input
              aria-label={t('matrix.quadrantName', { v0: quadrant.id })}
              value={quadrant.name ?? t(`quadrant.${quadrant.id}`, { ns: 'labels' })}
              onChange={(event) =>
                apply({
                  type: 'quadrant.update',
                  id: quadrant.id,
                  patch: { name: event.target.value.trim() ? event.target.value : null },
                })
              }
              className={
                'h-auto min-h-0 rounded-none border-0 bg-transparent p-0 shadow-none text-sm focus-visible:ring-0'
              }
            />
          </div>
        ))}
      </div>
    </WorkspaceDialog>
  );
}
