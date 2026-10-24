import { Field as FormField } from '@base-ui/react/field';
import { Button } from '@repo/ui/components/button';
import { Input } from '@repo/ui/components/input';
import { type FormEvent, useState } from 'react';
import type { TaskList } from '#application';
import { useWorkspace } from '#entities/workspace';
import { useI18n } from '#shared/i18n';
import { WorkspaceColorField } from '#shared/ui/WorkspaceColorField';
import { WorkspaceDialog } from '#shared/ui/WorkspaceDialog';

export function WorkspaceListEditor({
  list,
  close,
  onCreated,
  onRemoved,
}: {
  list: TaskList | 'new';
  close: () => void;
  onCreated: (id: string) => void;
  onRemoved: () => void;
}) {
  const { t } = useI18n();
  const { apply, persistence, notify, runOperation } = useWorkspace();
  const [name, setName] = useState(list === 'new' ? '' : list.name);
  const [color, setColor] = useState(list === 'new' ? '#7d9cc4' : list.color);

  function save(event: FormEvent) {
    event.preventDefault();

    if (!name.trim()) {
      return;
    }

    const id = list === 'new' ? crypto.randomUUID() : list.id;
    const accepted = apply({
      type: list === 'new' ? 'list.create' : 'list.update',
      list: { id, name: name.trim(), color },
    });

    if (!accepted) {
      return;
    }

    if (list === 'new') {
      onCreated(id);
    }

    close();
  }

  function remove() {
    if (list === 'new') {
      return;
    }

    if (!runOperation(() => persistence.removeList(list.id))) {
      return;
    }

    onRemoved();
    close();
    notify(t('lists.deleted'), { undoable: true });
  }

  return (
    <WorkspaceDialog
      title={list === 'new' ? t('lists.new') : t('lists.edit')}
      onClose={close}
      onSubmit={save}
      footer={
        <>
          {list !== 'new' && (
            <Button
              type="button"
              variant="outline"
              onClick={remove}
              className={
                'h-(--control-height) min-w-18 border-[color-mix(in_srgb,var(--danger-text)_35%,var(--popover))] bg-transparent text-danger-text hover:border-danger-text hover:bg-danger-surface'
              }
            >
              {t('lists.delete')}
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
            {t('lists.name')}
          </FormField.Label>
          <Input
            aria-label={t('lists.name')}
            required
            maxLength={80}
            value={name}
            onChange={(event) => setName(event.target.value)}
            className={
              'h-(--control-height) border-control-border bg-card px-[9px] py-[7px] text-sm'
            }
          />
        </FormField.Root>
        <WorkspaceColorField
          label={t('lists.color')}
          value={color}
          onChange={(value) => {
            if (value) {
              setColor(value);
            }
          }}
        />
      </div>
    </WorkspaceDialog>
  );
}
