import type { HTMLAttributes, Ref } from 'react';
import { Button as ButtonPrimitive } from '@base-ui/react/button';
import { cn } from 'cn';
import { type LucideIcon, MoreHorizontal } from 'lucide-react';

export function SidebarEntityRow({
  name,
  icon: Icon,
  color,
  count,
  selected,
  kind,
  editLabel,
  navigate,
  edit,
  ref,
  ...dropProps
}: {
  name: string;
  icon: LucideIcon;
  color?: string;
  count: number;
  selected: boolean;
  kind: 'list' | 'label';
  editLabel: string;
  navigate: () => void;
  edit: () => void;
} & Pick<HTMLAttributes<HTMLDivElement>, 'aria-description'> & {
    ref?: Ref<HTMLDivElement>;
  }) {
  return (
    <div
      ref={ref}
      {...dropProps}
      className={cn(
        "sidebar-item [&[data-drop-active]]:[background:color-mix(in_srgb,_var(--link)_14%,_var(--sidebar))] [&[data-task-drop='trash'][data-drop-active]]:[background:color-mix(in_srgb,_var(--destructive)_14%,_var(--sidebar))] [&[data-task-drop='trash'][data-drop-active]]:text-danger-text relative w-full flex items-center gap-3 h-(--sidebar-row-height) py-0 px-[11px] text-foreground rounded-md text-left text-sm m-0 leading-(--text-sm--line-height) [&_svg]:text-muted-foreground [&_span]:flex-1 [&_span]:overflow-hidden [&_span]:whitespace-nowrap [&_span]:text-ellipsis [&_small]:absolute [&_small]:right-(--sidebar-trailing-inset) [&_small]:top-[50%] [&_small]:[transform:translateY(-50%)] [&_small]:w-(--sidebar-trailing-size) [&_small]:h-(--sidebar-trailing-size) [&_small]:grid [&_small]:place-items-center [&_small]:text-xs [&_small]:tabular-nums [&_small]:text-muted-foreground [&_small]:leading-(--text-xs--line-height) [&:has(>_small)]:pr-[calc(var(--sidebar-trailing-size)_+_var(--sidebar-trailing-inset)_*_2)] sidebar-entity p-0 gap-0 hover:bg-surface-hover [&:has(:focus-visible)]:bg-surface-hover [&_>_button:first-child]:flex [&_>_button:first-child]:items-center [&_>_button:first-child]:gap-3 [&_>_button:first-child]:min-w-0 [&_>_button:first-child]:flex-1 [&_>_button:first-child]:h-(--sidebar-row-height) [&_>_button:first-child]:text-left [&_>_button:first-child]:[padding:0_calc(var(--sidebar-trailing-size)_+_var(--sidebar-trailing-inset)_*_2)_0_11px] [&_>_button:first-child]:bg-transparent",
        `sidebar-${kind}`,
        selected
          ? 'active [background:color-mix(in_srgb,_var(--primary)_8%,_transparent)] text-foreground [&_svg]:text-link hover:bg-surface-selected focus-within:bg-surface-selected'
          : '',
      )}
    >
      <ButtonPrimitive onClick={navigate} aria-current={selected ? 'page' : undefined}>
        <Icon
          size={18}
          style={color ? { color } : undefined}
          className="inline-block shrink-0 align-middle"
        />
        <span>{name}</span>
        <small className="entity-count [.sidebar-item[data-drop-active]_&]:opacity-100 [.sidebar-entity_&]:ml-auto [.sidebar-entity:hover_&]:opacity-0 [.sidebar-entity:has(:focus-visible)_&]:opacity-0">
          {count || ''}
        </small>
      </ButtonPrimitive>
      <ButtonPrimitive
        aria-label={editLabel}
        aria-haspopup="dialog"
        onClick={edit}
        className={
          'entity-edit [.sidebar-item[data-drop-active]_&]:invisible [.sidebar-entity_&]:absolute [.sidebar-entity_&]:right-(--sidebar-trailing-inset) [.sidebar-entity_&]:top-[50%] [.sidebar-entity_&]:[transform:translateY(-50%)] [.sidebar-entity_&]:opacity-0 [.sidebar-entity_&]:pointer-events-none [.sidebar-entity_&]:w-(--sidebar-trailing-size) [.sidebar-entity_&]:h-(--sidebar-trailing-size) [.sidebar-entity_&]:rounded-sm [.sidebar-entity_&]:shrink-0 [.sidebar-entity:hover_&]:opacity-100 [.sidebar-entity:hover_&]:pointer-events-auto [.sidebar-entity:has(:focus-visible)_&]:opacity-100 [.sidebar-entity:has(:focus-visible)_&]:pointer-events-auto icon-button inline-flex items-center justify-center rounded-sm w-7 h-7 p-0 text-muted-foreground hover:text-foreground hover:bg-surface-hover'
        }
      >
        <MoreHorizontal className="size-3.5 inline-block shrink-0 align-middle" />
      </ButtonPrimitive>
    </div>
  );
}
