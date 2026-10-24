import { Button as ButtonPrimitive } from '@base-ui/react/button';
import { Input } from '@repo/ui/components/input';
import { X } from 'lucide-react';
import { type RefObject, useState } from 'react';
import { useWorkspace } from '#entities/workspace';
import { useI18n } from '#shared/i18n';

export function QuadrantComposer({
  quadrantId,
  inputRef,
  close,
}: {
  quadrantId: string;
  inputRef: RefObject<HTMLInputElement | null>;
  close: () => void;
}) {
  const { t } = useI18n();
  const { taskActions } = useWorkspace();
  const [title, setTitle] = useState('');

  return (
    <form
      className="quadrant-add flex items-center shrink-0 gap-1 mx-(--quadrant-inset) p-1 border border-control-border rounded-sm focus-within:border-ring [&_input]:flex-1 [&_input]:min-w-0 [&_input]:w-0 [&_input]:p-1 [&_input]:border-0 [&_input]:bg-transparent [&_input]:text-sm [&_input]:leading-(--text-sm--line-height) [&_input:focus-visible]:shadow-[none]"
      onSubmit={(event) => {
        event.preventDefault();

        if (!title.trim()) {
          return;
        }

        const created = taskActions.createInQuadrant(quadrantId, title);

        if (created.status === 'applied') {
          setTitle('');
        }
      }}
    >
      <Input
        ref={inputRef}
        autoFocus
        aria-label={t('matrix.addTask')}
        placeholder={t('tasks.captureInstructions')}
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        onKeyDown={(event) => {
          if (event.nativeEvent.isComposing || event.keyCode === 229) {
            if (event.key === 'Enter') {
              event.preventDefault();
            }

            return;
          }

          if (event.key === 'Escape') {
            event.preventDefault();
            event.stopPropagation();
            close();
          }
        }}
        className={
          'h-auto min-h-0 rounded-none border-0 bg-transparent p-0 shadow-none text-sm focus-visible:ring-0'
        }
      />
      <ButtonPrimitive
        type="button"
        aria-label={t('tasks.closeCapture')}
        onClick={close}
        className={
          'icon-button inline-flex items-center justify-center rounded-sm w-7 h-7 p-0 text-muted-foreground hover:text-foreground hover:bg-surface-hover'
        }
      >
        <X className="size-4 inline-block shrink-0 align-middle" />
      </ButtonPrimitive>
    </form>
  );
}
