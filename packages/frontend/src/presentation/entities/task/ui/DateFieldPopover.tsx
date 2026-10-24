import { Button as ButtonPrimitive } from '@base-ui/react/button';
import { Popover } from '@base-ui/react/popover';
import { Button } from '@repo/ui/components/button';
import { X } from 'lucide-react';
import { type ReactNode, type RefObject, useRef } from 'react';
import { useI18n } from '#shared/i18n';
import { WorkspacePopover } from '#shared/ui/WorkspacePopover';

export interface DateFieldEditor {
  apply: () => boolean;
}

export function DateFieldPopover({
  id,
  anchor,
  positionAnchor,
  handle,
  title,
  kind,
  dismiss,
  clear,
  children,
}: {
  id: string;
  anchor: RefObject<HTMLButtonElement | null>;
  positionAnchor: RefObject<HTMLDivElement | null>;
  handle: NonNullable<Popover.Root.Props['handle']>;
  title: string;
  kind: 'time' | 'duration' | 'repeat';
  dismiss: () => void;
  clear: () => void;
  children: (editor: RefObject<DateFieldEditor | null>, done: () => void) => ReactNode;
}) {
  const { t } = useI18n();
  const panelRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<DateFieldEditor>(null);

  return (
    <WorkspacePopover
      ref={panelRef}
      anchor={positionAnchor}
      handle={handle}
      triggerId={anchor.current?.id}
      onClose={dismiss}
      side="right"
      initialFocus={false}
      id={id}
      data-property={kind}
      className="date-field-popover w-76 flex flex-col overflow-hidden"
      aria-label={title}
    >
      <header className="date-field-header flex items-center justify-between gap-2 [padding:8px_12px_0] shrink-0 [&_>_strong]:font-medium [&_>_button]:grid [&_>_button]:place-items-center [&_>_button]:w-8 [&_>_button]:h-8 [&_>_button]:p-0 [&_>_button]:text-muted-foreground [&_>_button]:rounded-sm [&_>_button:hover]:bg-overlay-hover">
        <strong>{title}</strong>
        <Popover.Close
          render={<ButtonPrimitive />}
          type="button"
          aria-label={t('common.closePicker')}
        >
          <X className="size-4 inline-block shrink-0 align-middle" />
        </Popover.Close>
      </header>
      <div className="date-field-body flex flex-col min-h-0 overflow-auto [&::-webkit-scrollbar]:size-[7px] [&::-webkit-scrollbar-thumb]:rounded-lg [&::-webkit-scrollbar-thumb]:bg-scrollbar [&::-webkit-scrollbar-thumb:hover]:bg-scrollbar-hover [padding:8px_12px_12px] overscroll-contain [.date-field-popover[data-property='repeat']_&]:p-1">
        {children(editorRef, () => dismiss())}
      </div>
      <div className="overlay-footer flex shrink-0 items-center justify-between gap-(--overlay-gap) p-3 [border-top:1px_solid_var(--separator)] date-field-footer">
        <Button
          variant="ghost"
          size="sm"
          onClick={clear}
          className={' text-muted-foreground hover:text-foreground'}
        >
          {t(
            kind === 'time'
              ? 'time.clear'
              : kind === 'duration'
                ? 'common.resetDefault'
                : 'repeat.none',
          )}
        </Button>
        <Button
          size="sm"
          onClick={() => {
            if (editorRef.current?.apply()) {
              dismiss();
            }
          }}
          className={
            ' bg-button-primary text-button-primary-foreground hover:bg-button-primary-hover'
          }
        >
          {t(kind === 'time' ? 'common.complete' : 'common.apply')}
        </Button>
      </div>
    </WorkspacePopover>
  );
}
