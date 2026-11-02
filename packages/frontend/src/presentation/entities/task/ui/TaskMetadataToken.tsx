import { cn } from 'cn';
import { List, Tag } from 'lucide-react';

export function TaskMetadataToken({
  name,
  color,
  kind = 'label',
}: {
  name: string;
  color?: string;
  kind?: 'list' | 'label';
}) {
  return (
    <span
      className={cn(
        'task-token [&_>_svg]:shrink-0 [&_>_svg]:text-[color:var(--metadata-color,_var(--muted-foreground))] [&_>_span]:min-w-0 [&_>_span]:wrap-anywhere',
        kind === 'list'
          ? 'row-list inline-flex items-center gap-1 min-w-0 max-w-full text-[color:color-mix(in_srgb,_var(--muted-foreground)_80%,_var(--foreground))] text-xs leading-(--text-xs--line-height) max-w-[min(160px,_100%)] text-muted-foreground [&_>_svg]:shrink-0 [&_>_span]:overflow-hidden [&_>_span]:text-ellipsis [&_>_span]:whitespace-nowrap'
          : 'inline-tag inline-flex items-center gap-1 min-w-0 max-w-full text-[color:color-mix(in_srgb,_var(--muted-foreground)_80%,_var(--foreground))] text-xs leading-(--text-xs--line-height)',
      )}
      data-colored={color ? true : undefined}
      title={name}
      style={{ '--metadata-color': color }}
    >
      {kind === 'list' ? (
        <List className="size-3 inline-block shrink-0 align-middle" />
      ) : (
        <Tag className="size-3 inline-block shrink-0 align-middle" />
      )}
      <span>{name}</span>
    </span>
  );
}
