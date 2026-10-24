import type { RefObject } from 'react';
import { Popover } from '@base-ui/react/popover';
import { cn } from 'cn';

export function WorkspacePopover({
  anchor,
  onClose,
  open = true,
  side = 'bottom',
  align = 'start',
  collisionBoundary,
  handle,
  triggerId,
  modal = 'trap-focus',
  children,
  className,
  ...props
}: Popover.Popup.Props & {
  anchor: RefObject<HTMLElement | null>;
  onClose: () => void;
  open?: boolean;
  side?: Popover.Positioner.Props['side'];
  align?: Popover.Positioner.Props['align'];
  collisionBoundary?: Popover.Positioner.Props['collisionBoundary'];
  modal?: Popover.Root.Props['modal'];
  handle?: Popover.Root.Props['handle'];
  triggerId?: string;
}) {
  return (
    <Popover.Root
      open={open}
      modal={modal}
      handle={handle}
      triggerId={triggerId}
      onOpenChange={(next) => {
        if (!next) {
          onClose();
        }
      }}
    >
      <Popover.Portal>
        <Popover.Positioner
          anchor={anchor}
          side={side}
          align={align}
          sideOffset={8}
          collisionPadding={8}
          collisionBoundary={collisionBoundary}
          collisionAvoidance={{ side: 'flip', align: 'shift', fallbackAxisSide: 'end' }}
          className="isolate z-50"
        >
          <Popover.Popup
            {...props}
            className={cn(
              'overlay-panel relative max-h-[min(var(--available-height),calc(100dvh-16px))] max-w-[min(var(--available-width),calc(100vw-16px))] overflow-auto overscroll-contain rounded-md ring-1 ring-foreground/10 bg-popover text-sm text-popover-foreground shadow-md outline-none',
              className,
            )}
          >
            {children}
          </Popover.Popup>
        </Popover.Positioner>
      </Popover.Portal>
    </Popover.Root>
  );
}
