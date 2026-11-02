import { cn } from 'cn';
import { ArrowDownWideNarrow, Layers3 } from 'lucide-react';
import invariant from 'tiny-invariant';
import type { TaskViewOptions } from '#application';
import { useI18n } from '#shared/i18n';
import { WorkspaceActions } from '#shared/ui/WorkspaceActions';

export function TaskViewControls({
  value,
  onChange,
  listScope,
}: {
  value: TaskViewOptions;
  onChange: (patch: Partial<TaskViewOptions>) => void;
  listScope: boolean;
}) {
  const { t } = useI18n();
  const sorts = [
    { key: 'manual', label: t('tasks.manual') },
    { key: 'date', label: t('tasks.dateAscending') },
    { key: 'date-desc', label: t('tasks.dateDescending') },
    { key: 'priority', label: t('tasks.priorityDescending') },
    { key: 'priority-asc', label: t('tasks.priorityAscending') },
    { key: 'title', label: t('tasks.titleAscending') },
    { key: 'title-desc', label: t('tasks.titleDescending') },
  ] as const;
  const groups = [
    { key: 'none', label: t('tasks.noGrouping') },
    { key: 'date', label: t('dates.date') },
    ...(!listScope ? [{ key: 'list', label: t('lists.title') } as const] : []),
    { key: 'priority', label: t('tasks.priority') },
  ] as const;
  const sort = sorts.find((item) => item.key === value.sort);
  const group = groups.find((item) => item.key === value.group);
  invariant(
    sort !== undefined && group !== undefined,
    'Task view options must be available in this scope',
  );
  return (
    <div className="header-actions flex items-center gap-[9px] [@media(max-width:_600px)]:gap-[3px] [.workspace-actions_&]:gap-2 [@media(max-width:_600px)]:[.workspace-actions_&]:gap-1 task-view-controls">
      <WorkspaceActions
        label={t('tasks.sort')}
        title={t('tasks.sortValue', {
          value: sort.label,
        })}
        className="view-option size-(--workspace-control-size) max-[600px]:size-7"
        triggerClassName={cn(
          'size-(--workspace-control-size) max-[600px]:size-7 opacity-100 rounded-md hover:bg-surface-hover hover:text-foreground aria-expanded:bg-surface-hover aria-expanded:text-foreground',
          value.sort !== 'manual' && 'text-link',
        )}
        triggerIcon={<ArrowDownWideNarrow className="size-4 inline-block shrink-0 align-middle" />}
        items={sorts.map((item) => ({
          label: item.label,
          checked: item.key === value.sort,
          action: () => onChange({ sort: item.key }),
        }))}
      />
      <WorkspaceActions
        label={t('tasks.group')}
        title={t('tasks.groupValue', {
          value: group.label,
        })}
        className="view-option size-(--workspace-control-size) max-[600px]:size-7"
        triggerClassName={cn(
          'size-(--workspace-control-size) max-[600px]:size-7 opacity-100 rounded-md hover:bg-surface-hover hover:text-foreground aria-expanded:bg-surface-hover aria-expanded:text-foreground',
          value.group !== 'none' && 'text-link',
        )}
        triggerIcon={<Layers3 className="size-4 inline-block shrink-0 align-middle" />}
        items={groups.map((item) => ({
          label: item.label,
          checked: item.key === value.group,
          action: () => onChange({ group: item.key }),
        }))}
      />
    </div>
  );
}
