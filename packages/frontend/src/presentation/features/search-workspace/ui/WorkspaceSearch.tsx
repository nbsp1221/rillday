import { Button as ButtonPrimitive } from '@base-ui/react/button';
import { Button } from '@repo/ui/components/button';
import { Input } from '@repo/ui/components/input';
import { cn } from 'cn';
import { Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import type { Task } from '#application';
import { useWorkspace } from '#entities/workspace';
import { useI18n } from '#shared/i18n';
import { WorkspaceDialog } from '#shared/ui/WorkspaceDialog';

export function WorkspaceSearch({
  query,
  onQueryChange,
  onSelect,
  close,
}: {
  query: string;
  onQueryChange: (query: string) => void;
  onSelect: (task: Task) => void;
  close: () => void;
}) {
  const { t } = useI18n();
  const { data } = useWorkspace();
  const normalizedQuery = query.trim().toLowerCase();
  const [pagination, setPagination] = useState({ query: normalizedQuery, limit: 100 });
  const visibleLimit = pagination.query === normalizedQuery ? pagination.limit : 100;
  const results = useMemo(
    () =>
      normalizedQuery
        ? data.tasks.filter(
            (task) =>
              !task.deleted &&
              `${task.title} ${task.notes} ${task.tags.join(' ')}`
                .toLowerCase()
                .includes(normalizedQuery),
          )
        : [],
    [data.tasks, normalizedQuery],
  );

  return (
    <WorkspaceDialog title={t('search.all')} onClose={close} wide>
      <div className="global-search relative text-muted-foreground">
        <Search
          size={16}
          className={cn(
            'inline-block shrink-0 align-middle',
            'pointer-events-none absolute left-3 top-1/2 -translate-y-1/2',
          )}
        />
        <Input
          aria-label={t('search.query')}
          placeholder={t('search.placeholder')}
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          className={cn(
            'h-(--control-height) border-control-border bg-card px-[9px] py-[7px] text-sm',
            'w-full pl-10 pr-3',
          )}
        />
      </div>
      <div className="search-results -mx-2 [&_button]:flex [&_button]:items-center [&_button]:justify-between [&_button]:gap-5 [&_button]:w-full [&_button]:text-left [&_button]:p-2 [&_button]:rounded-sm [&_button]:text-sm [&_button]:leading-(--text-sm--line-height) [&_button_span]:overflow-hidden [&_button_span]:text-ellipsis [&_button_span]:whitespace-nowrap [&_small]:text-muted-foreground [&_small]:text-xs [&_small]:whitespace-nowrap [&_small]:leading-(--text-xs--line-height) [&_p]:m-0 [&_p]:py-0 [&_p]:px-2 [&_p]:text-sm [&_p]:leading-(--text-sm--line-height)">
        {results.slice(0, visibleLimit).map((task) => (
          <ButtonPrimitive
            key={task.id}
            onClick={() => onSelect(task)}
            className={cn('workspace-option')}
          >
            <span
              className={cn(task.completedAt ? 'strike line-through text-muted-foreground' : '')}
            >
              {task.title}
            </span>
            <small>
              {task.listId === 'inbox'
                ? t('lists.inbox')
                : data.lists.find((list) => list.id === task.listId)?.name}
            </small>
          </ButtonPrimitive>
        ))}
        {results.length > visibleLimit && (
          <Button
            variant="outline"
            onClick={() => setPagination({ query: normalizedQuery, limit: visibleLimit + 100 })}
            className={'h-(--control-height)'}
          >
            {t('tasks.showMore', { shown: visibleLimit, total: results.length })}
          </Button>
        )}
        {!normalizedQuery && (
          <p className="muted [.modal-body_>_&]:m-0 [.modal-body_>_&]:text-sm [.modal-body_>_&]:leading-(--text-sm--line-height) [.modal-body_>_&]:text-muted-foreground text-muted-foreground">
            {t('search.description')}
          </p>
        )}
        {normalizedQuery && !results.length && (
          <p
            className="muted [.modal-body_>_&]:m-0 [.modal-body_>_&]:text-sm [.modal-body_>_&]:leading-(--text-sm--line-height) [.modal-body_>_&]:text-muted-foreground text-muted-foreground"
            role="status"
          >
            {t('search.empty')}
            <br />
            {t('search.emptyDescription')}
          </p>
        )}
      </div>
    </WorkspaceDialog>
  );
}
