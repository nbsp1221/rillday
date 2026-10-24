import { Field as FormField } from '@base-ui/react/field';
import { Button } from '@repo/ui/components/button';
import { Input } from '@repo/ui/components/input';
import { type FormEvent, useRef, useState } from 'react';
import { workspaceLabelColor, workspaceLabels } from '#application';
import { useWorkspace } from '#entities/workspace';
import { useI18n } from '#shared/i18n';
import { WorkspaceColorField } from '#shared/ui/WorkspaceColorField';
import { WorkspaceDialog } from '#shared/ui/WorkspaceDialog';

export function LabelEditor({
  label,
  close,
  navigate,
}: {
  label?: string;
  close: () => void;
  navigate: (filter: string) => void;
}) {
  const { t } = useI18n();
  const { data, persistence, notify, runOperation } = useWorkspace();
  const [name, setName] = useState(label ?? '');
  const [color, setColor] = useState<string | undefined>(() =>
    label ? workspaceLabelColor(data, label) : undefined,
  );
  const nameRef = useRef<HTMLInputElement>(null);

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const input = nameRef.current;

    if (!input) {
      return;
    }

    const value = name.trim().replace(/^#+/u, '');
    let error = '';

    if (!value || /[\s#]/u.test(value)) {
      error = t('labels.invalidName');
    } else if (value !== label && workspaceLabels(data).includes(value)) {
      error = t('labels.duplicateName');
    }

    input.setCustomValidity(error);

    if (error) {
      input.reportValidity();

      return;
    }

    const reportError = (error: unknown) => {
      input.setCustomValidity(
        error instanceof Error && error.message === 'not_found'
          ? t('labels.deletedElsewhere')
          : t('operations.saveFailed'),
      );
      input.reportValidity();
    };

    const accepted =
      label !== undefined
        ? runOperation(() => persistence.renameLabel(label, value, color ?? null), reportError)
        : runOperation(() => persistence.apply({ type: 'label.create', name: value, color }));

    if (!accepted) {
      return;
    }

    close();
    navigate(`tag:${value}`);
  }

  return (
    <WorkspaceDialog
      title={label === undefined ? t('labels.new') : t('labels.edit')}
      onClose={close}
      onSubmit={save}
      footer={
        <>
          {label !== undefined && (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                if (!runOperation(() => persistence.removeLabel(label))) {
                  return;
                }

                close();
                navigate('list:inbox');
                notify(t('labels.deleted'), { undoable: true });
              }}
              className={
                'h-(--control-height) min-w-18 border-[color-mix(in_srgb,var(--danger-text)_35%,var(--popover))] bg-transparent text-danger-text hover:border-danger-text hover:bg-danger-surface'
              }
            >
              {t('labels.delete')}
            </Button>
          )}
          <Button
            type="submit"
            className={
              'h-(--control-height) min-w-18 bg-button-primary text-button-primary-foreground hover:bg-button-primary-hover'
            }
          >
            {t('common.save')}
          </Button>
        </>
      }
    >
      <div className="form-stack flex flex-col gap-(--layout-form-gap) [&_p]:m-0 [&_p]:text-sm [&_p]:leading-(--text-sm--line-height) [&_p]:text-muted-foreground">
        <FormField.Root className={'form-field flex min-w-0 flex-col gap-(--layout-field-gap)'}>
          <FormField.Label className="w-fit text-sm text-muted-foreground">
            {t('common.name')}
          </FormField.Label>
          <Input
            ref={nameRef}
            name="labelName"
            required
            maxLength={80}
            value={name}
            onChange={(event) => {
              event.currentTarget.setCustomValidity('');
              setName(event.target.value);
            }}
            className={
              'h-(--control-height) border-control-border bg-card px-[9px] py-[7px] text-sm'
            }
          />
        </FormField.Root>
        <WorkspaceColorField
          label={t('labels.color')}
          value={color}
          onChange={setColor}
          allowReset
        />
      </div>
    </WorkspaceDialog>
  );
}
