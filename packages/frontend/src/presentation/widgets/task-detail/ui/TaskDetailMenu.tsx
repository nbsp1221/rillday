import type { Dispatch, ReactElement, ReactNode, RefObject, SetStateAction } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@repo/ui/components/dropdown-menu';

export type TaskDetailPopover = 'date' | 'priority' | 'list' | 'tags' | 'actions' | null;

export interface TaskDetailPopoverControls {
  active: TaskDetailPopover;
  setActive: Dispatch<SetStateAction<TaskDetailPopover>>;
  triggerRef: RefObject<HTMLButtonElement | null>;
  contentRef: RefObject<HTMLDivElement | null>;
  close: () => void;
  open: (value: TaskDetailPopover, trigger: HTMLButtonElement) => void;
}

export function TaskDetailMenu({
  popovers,
  kind,
  label,
  trigger,
  children,
}: {
  popovers: TaskDetailPopoverControls;
  kind: 'list' | 'priority' | 'actions';
  label: string;
  trigger: ReactElement;
  children: ReactNode;
}) {
  const { active, setActive, triggerRef, contentRef } = popovers;
  return (
    <DropdownMenu
      open={active === kind}
      modal={false}
      onOpenChange={(next) =>
        setActive((current) => (next ? kind : current === kind ? null : current))
      }
    >
      <DropdownMenuTrigger
        render={trigger}
        onPointerDownCapture={(event) => {
          triggerRef.current = event.currentTarget;
        }}
        onKeyDownCapture={(event) => {
          triggerRef.current = event.currentTarget;
        }}
      />
      <DropdownMenuContent
        ref={contentRef}
        className="td-popover min-w-47.5 p-1 [font-family:var(--font-sans)] text-sm leading-(--text-sm--line-height) [&_select]:[font-family:inherit] [&_input]:[font-family:inherit] [&_button]:[font-family:inherit] [&_button:focus-visible]:[outline:2px_solid_var(--ring)] [&_button:focus-visible]:-outline-offset-2"
        aria-label={label}
        align="start"
      >
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
