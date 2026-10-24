import type { ReactNode } from 'react';
import { Button } from '@repo/ui/components/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@repo/ui/components/collapsible';
import { cn } from 'cn';
import { ChevronRight, Plus } from 'lucide-react';

export function TaskSidebarSection({
  title,
  expanded,
  setExpanded,
  createLabel,
  create,
  emptyLabel,
  children,
  className,
}: {
  title: string;
  expanded: boolean;
  setExpanded: (expanded: boolean) => void;
  createLabel: string;
  create: () => void;
  emptyLabel?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Collapsible
      open={expanded}
      onOpenChange={setExpanded}
      className={cn('sidebar-group mt-1 data-open:mb-3', className)}
    >
      <div className="sidebar-section-heading group flex h-(--sidebar-trailing-size) items-center justify-between rounded-md pr-(--sidebar-trailing-inset) text-xs text-muted-foreground hover:bg-surface-hover has-focus-visible:bg-surface-hover">
        <CollapsibleTrigger className="sidebar-section-toggle flex h-full min-w-0 flex-1 items-center gap-1 rounded-md px-3 text-left hover:text-foreground">
          <span className="truncate">{title}</span>
          <ChevronRight className="size-3 transition-transform duration-200 in-data-open:rotate-90 motion-reduce:transition-none" />
        </CollapsibleTrigger>
        <Button
          variant="ghost"
          size="icon-xs"
          className="sidebar-group-add size-(--sidebar-trailing-size) opacity-0 group-hover:opacity-100 group-has-focus-visible:opacity-100 [@media(hover:none),(pointer:coarse)]:opacity-100"
          aria-label={createLabel}
          aria-haspopup="dialog"
          onClick={() => {
            setExpanded(true);
            create();
          }}
        >
          <Plus size={14} />
        </Button>
      </div>
      <CollapsibleContent
        keepMounted
        className="sidebar-group-content h-(--collapsible-panel-height) overflow-hidden transition-[height] duration-200 data-ending-style:h-0 data-starting-style:h-0 motion-reduce:transition-none"
      >
        <div className="sidebar-group-inner min-h-0">
          {emptyLabel ? (
            <Button
              variant="ghost"
              className="sidebar-add h-(--sidebar-row-height) w-full justify-start gap-3 px-[11px] py-0 text-sm font-normal"
              onClick={create}
            >
              <Plus size={18} />
              {emptyLabel}
            </Button>
          ) : (
            children
          )}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
