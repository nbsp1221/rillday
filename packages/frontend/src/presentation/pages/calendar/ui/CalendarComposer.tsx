import { Button } from '@repo/ui/components/button';
import { Input } from '@repo/ui/components/input';
import { type KeyboardEvent, useRef } from 'react';
import { useWorkspace } from '#entities/workspace';
import { useI18n } from '#shared/i18n';
import { WorkspaceDialog } from '#shared/ui/WorkspaceDialog';
import { WorkspaceField as FormField } from '#shared/ui/WorkspaceField';

export function CalendarComposer({
  composer,
  input,
  setInput,
  close,
}: {
  composer: {
    date: string;
    time: string | null;
  };
  input: string;
  setInput: (value: string) => void;
  close: () => void;
}) {
  const { t, formatDate, formatTime: timeLabel } = useI18n();
  const { taskActions } = useWorkspace();
  const composerInputRef = useRef<HTMLInputElement>(null);

  function add(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing || event.keyCode === 229) {
      if (event.key === 'Enter') {
        event.preventDefault();
      }

      return;
    }
  }

  return (
    <WorkspaceDialog
      title={t('tasks.addScheduled')}
      initialFocus={composerInputRef}
      onClose={close}
      onSubmit={(event) => {
        event.preventDefault();

        if (!input.trim()) {
          return;
        }

        if (taskActions.create(input, composer).status === 'applied') {
          setInput('');
          close();
        }
      }}
      footer={
        <>
          <Button
            variant="ghost"
            onClick={close}
            className={'h-(--control-height) min-w-18 text-muted-foreground hover:text-foreground'}
          >
            {t('common.cancel')}
          </Button>
          <Button
            type="submit"
            disabled={!input.trim()}
            className={
              'h-(--control-height) min-w-18 bg-button-primary text-button-primary-foreground hover:bg-button-primary-hover'
            }
          >
            {t('common.add')}
          </Button>
        </>
      }
    >
      <div className="form-stack flex flex-col gap-(--layout-form-gap) [&_p]:m-0 [&_p]:text-sm [&_p]:leading-(--text-sm--line-height) [&_p]:text-muted-foreground">
        <FormField.Root>
          <FormField.Label className="w-fit text-sm text-muted-foreground">
            {t('calendar.addOnDate', {
              date: `${formatDate(composer.date)}${composer.time ? ` ${timeLabel(composer.time)}` : ''}`,
            })}
          </FormField.Label>
          <Input
            ref={composerInputRef}
            aria-label={t('tasks.title')}
            placeholder={t('tasks.capturePlaceholder')}
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={add}
            className={
              'h-(--control-height) border-control-border bg-card px-[9px] py-[7px] text-sm'
            }
          />
        </FormField.Root>
      </div>
    </WorkspaceDialog>
  );
}
