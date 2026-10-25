import type { ReactElement, ReactNode } from 'react';
import { Button as ButtonPrimitive } from '@base-ui/react/button';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@repo/ui/components/context-menu';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@repo/ui/components/dropdown-menu';
import { cn } from 'cn';
import { MoreHorizontal } from 'lucide-react';

interface WorkspaceAction {
  id?: string;
  label: string;
  icon?: ReactNode;
  action: () => void;
  destructive?: boolean;
  disabled?: boolean;
  checked?: boolean;
  kind?: 'checkbox';
}

export function WorkspaceActions({
  label,
  items,
  triggerIcon,
  title,
  className,
  triggerClassName,
}: {
  label: string;
  items: WorkspaceAction[];
  triggerIcon?: ReactNode;
  title?: string;
  className?: string;
  triggerClassName?: string;
}) {
  return (
    <DropdownMenu>
      <span className={cn('row-menu inline-flex shrink-0', className)}>
        <DropdownMenuTrigger
          render={<ButtonPrimitive />}
          className={cn(
            'row-menu-trigger inline-flex size-6 items-center justify-center rounded-sm text-muted-foreground',
            triggerClassName,
          )}
          aria-label={label}
          title={title}
          onClick={(event) => event.stopPropagation()}
        >
          {triggerIcon ?? <MoreHorizontal size={16} />}
        </DropdownMenuTrigger>
      </span>
      <DropdownMenuContent
        className="rillday-action-menu w-[min(224px,calc(100vw-16px))] bg-popover"
        data-rillday-menu
        aria-label={label}
        align="end"
        onClick={(event) => event.stopPropagation()}
      >
        <DropdownMenuRadioGroup
          value={String(items.findIndex((item) => item.checked && item.kind !== 'checkbox'))}
        >
          {items.map((item, index) => {
            const props = {
              disabled: item.disabled,
              onClick: item.action,
              className: 'min-h-8 [&>span]:min-w-0 [&>span]:wrap-anywhere',
              variant: item.destructive ? ('destructive' as const) : ('default' as const),
            };
            const content = (
              <>
                {item.icon}
                <span>{item.label}</span>
              </>
            );

            return item.checked === undefined ? (
              <DropdownMenuItem key={item.id ?? item.label} {...props}>
                {content}
              </DropdownMenuItem>
            ) : item.kind === 'checkbox' ? (
              <DropdownMenuCheckboxItem
                closeOnClick
                key={item.id ?? item.label}
                {...props}
                checked={item.checked}
              >
                {content}
              </DropdownMenuCheckboxItem>
            ) : (
              <DropdownMenuRadioItem
                closeOnClick
                key={item.id ?? item.label}
                {...props}
                value={String(index)}
              >
                {content}
              </DropdownMenuRadioItem>
            );
          })}
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function WorkspaceContextActions({
  label,
  items,
  children,
}: {
  label: string;
  items: WorkspaceAction[];
  children: ReactElement;
}) {
  return (
    <ContextMenu>
      <ContextMenuTrigger render={children} />
      <ContextMenuContent
        className="rillday-action-menu w-[min(224px,calc(100vw-16px))] bg-popover"
        data-rillday-menu
        aria-label={label}
        onClick={(event) => event.stopPropagation()}
      >
        {items.map((item) => (
          <ContextMenuItem
            key={item.id ?? item.label}
            disabled={item.disabled}
            variant={item.destructive ? 'destructive' : 'default'}
            onClick={item.action}
            className="min-h-8"
          >
            {item.icon}
            <span>{item.label}</span>
          </ContextMenuItem>
        ))}
      </ContextMenuContent>
    </ContextMenu>
  );
}
