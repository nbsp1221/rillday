import { Button as ButtonPrimitive } from '@base-ui/react/button';
import { Button } from '@repo/ui/components/button';
import { Inbox, Trash2 } from 'lucide-react';
import { Fragment, type ReactNode, useState } from 'react';
import type { TaskViewOptions } from '#application';
import { dateKey, workspaceLabels } from '#application';
import { useAppPreferences } from '#entities/preferences';
import { taskScopes } from '#entities/task';
import { useWorkspace } from '#entities/workspace';
import { QuickAdd } from '#features/task-capture';
import { useI18n } from '#shared/i18n';
import { WorkspaceChoice } from '#shared/ui/WorkspaceChoice';
import { WorkspaceDialog } from '#shared/ui/WorkspaceDialog';
import { TaskContent, TaskItems, TaskSection } from '#widgets/task-list';
import { WorkspaceHeader } from '../../../shared/ui/WorkspaceHeader';
import { getTaskViewModel } from '../model/task-view-model';
import { TaskViewControls } from './TaskViewControls';

export function TaskListView({
  filter,
  navigate,
  sidebarControl,
  narrow,
}: {
  filter: string;
  navigate: (filter: string) => void;
  sidebarControl: ReactNode;
  narrow: boolean;
}) {
  const { t, formatDate, locale } = useI18n();
  const { preferences, updatePreferences } = useAppPreferences();
  const { data, taskActions, selectTask } = useWorkspace();
  const [contentBoundary, setContentBoundary] = useState<HTMLDivElement | null>(null);
  const [showCompleted, setShowCompleted] = useState(preferences.showCompleted);
  const [previousShowCompletedPreference, setPreviousShowCompletedPreference] = useState(
    preferences.showCompleted,
  );
  const [confirmEmpty, setConfirmEmpty] = useState(false);
  const [previousFilter, setPreviousFilter] = useState(filter);
  const defaults: TaskViewOptions = {
    sort: 'manual',
    group: filter === 'today' || filter === 'next' ? 'date' : 'none',
  };
  const saved = preferences.taskViews[filter] ?? defaults;
  const options = {
    ...saved,
    group: filter.startsWith('list:') && saved.group === 'list' ? ('none' as const) : saved.group,
  };

  function setOptions(patch: Partial<TaskViewOptions>) {
    updatePreferences({
      taskViews: { [filter]: { ...options, ...patch } },
    });
  }

  const [collapsedSections, setCollapsedSections] = useState(() => new Set<string>());

  if (previousFilter !== filter) {
    setPreviousFilter(filter);
    setConfirmEmpty(false);
  }

  if (previousShowCompletedPreference !== preferences.showCompleted) {
    setPreviousShowCompletedPreference(preferences.showCompleted);
    setShowCompleted(preferences.showCompleted);
  }

  const scope = taskScopes.find((item) => item.id === filter);
  const labels = workspaceLabels(data);
  const title = scope
    ? t(scope.label, { context: scope.context })
    : ((filter.startsWith('list:')
        ? data.lists.find((list) => list.id === filter.slice(5))?.name
        : filter.slice(4)) ?? t('tasks.task'));
  const { tasks, archive, groups } = getTaskViewModel({
    data,
    filter,
    options,
    locale,
    t,
    formatDate,
  });

  function toggleSection(key: string) {
    if (key === 'completed') {
      setShowCompleted((value) => !value);

      return;
    }

    const id = `${filter}:${key}`;
    setCollapsedSections((previous) => {
      const next = new Set(previous);

      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }

      return next;
    });
  }

  return (
    <section className="task-view [--task-content-inset:20px] [--task-content-end-inset:var(--task-content-inset)] h-full flex flex-col min-h-0 [@media(min-width:_900px)]:[.workspace-body:has(>_[data-panel]:not([hidden])_.detail-pane)_&]:[--task-content-end-inset:calc(var(--task-content-inset)_-_var(--detail-pane-inset))] [@media(max-width:_899px)]:[--task-content-inset:16px]">
      <WorkspaceHeader
        leadingControl={sidebarControl}
        title={title}
        scopeControl={
          narrow && (
            <WorkspaceChoice
              className="mobile-task-scope flex w-auto max-w-47.5 min-w-0 h-(--workspace-control-size) py-0 px-2 -mx-2 border-transparent bg-transparent text-xl font-semibold leading-(--text-xl--line-height) hover:bg-surface-hover aria-expanded:bg-surface-hover max-[600px]:max-w-37.5"
              name={t('lists.choose')}
              value={filter}
              options={[
                ...taskScopes.map((item) => ({
                  value: item.id,
                  label: t(item.label, { context: item.context }),
                  group: t('tasks.titlePlural'),
                })),
                ...data.lists
                  .filter((list) => list.id !== 'inbox')
                  .map((list) => ({
                    value: `list:${list.id}`,
                    label: list.name,
                    group: t('lists.title'),
                  })),
                ...labels
                  .sort()
                  .map((tag) => ({ value: `tag:${tag}`, label: tag, group: t('labels.title') })),
              ]}
              onChange={navigate}
            />
          )
        }
      >
        <div className="header-actions flex items-center gap-[9px] [@media(max-width:_600px)]:gap-[3px] [.workspace-actions_&]:gap-2 [@media(max-width:_600px)]:[.workspace-actions_&]:gap-1">
          <TaskViewControls
            value={options}
            onChange={setOptions}
            listScope={filter.startsWith('list:')}
          />
          {filter === 'trash' && tasks.length > 0 && (
            <span className="task-header-danger flex ml-1 pl-3 [border-left:1px_solid_var(--separator)] [&_>_button]:inline-flex [&_>_button]:items-center [&_>_button]:justify-center [&_>_button]:gap-2 [&_>_button]:min-w-(--workspace-control-size) [&_>_button]:h-(--workspace-control-size) [&_>_button]:py-0 [&_>_button]:px-2 [&_>_button]:text-danger-text [&_>_button]:rounded-md [&_>_button]:text-sm [&_>_button]:leading-(--text-sm--line-height) [&_>_button]:whitespace-nowrap [&_>_button:hover]:bg-surface-hover [@media(max-width:_600px)]:ml-0 [@media(max-width:_600px)]:pl-1 [@media(max-width:_600px)]:[&_>_button]:min-w-7 [@media(max-width:_600px)]:[&_>_button]:h-7 [@media(max-width:_600px)]:[&_>_button]:p-0 [@media(max-width:_600px)]:[&_>_button_>_span]:hidden">
              <ButtonPrimitive
                aria-label={t('tasks.emptyTrash')}
                title={t('tasks.emptyTrash')}
                onClick={() => setConfirmEmpty(true)}
              >
                <Trash2 className="size-4 inline-block shrink-0 align-middle" />
                <span>{t('tasks.emptyTrash')}</span>
              </ButtonPrimitive>
            </span>
          )}
        </div>
      </WorkspaceHeader>
      <div ref={setContentBoundary} className="flex min-h-0 flex-1 flex-col">
        <TaskContent>
          {groups
            .filter((group) => group.tasks.length > 0)
            .map((group) => {
              const items = (
                <TaskItems
                  tasks={group.tasks}
                  showList={
                    !filter.startsWith('list:') &&
                    (options.group !== 'list' || group.key === 'completed')
                  }
                  reorder={
                    !archive &&
                    group.key !== 'completed' &&
                    options.sort === 'manual' &&
                    options.group === 'none'
                      ? taskActions.reorder
                      : undefined
                  }
                />
              );

              return group.title ? (
                <TaskSection
                  key={group.key}
                  title={group.title}
                  count={group.tasks.length}
                  expanded={
                    group.key === 'completed'
                      ? showCompleted
                      : !collapsedSections.has(`${filter}:${group.key}`)
                  }
                  onToggle={() => toggleSection(group.key)}
                  overdue={group.key === 'date:overdue'}
                >
                  {items}
                </TaskSection>
              ) : (
                <Fragment key={group.key}>{items}</Fragment>
              );
            })}
          {tasks.length === 0 && (
            <div className="empty-state flex flex-col items-center justify-center py-[75px] px-6 text-muted-foreground text-center [&_h3]:text-base [&_h3]:font-normal [&_h3]:text-muted-foreground [&_h3]:[margin:19px_0_8px] [&_h3]:leading-(--text-base--line-height) [&_p]:text-sm [&_p]:text-muted-foreground [&_p]:m-0 [&_p]:leading-(--text-sm--line-height)">
              <Inbox className="size-10 inline-block shrink-0 align-middle" />
              <h3>
                {filter === 'completed'
                  ? t('tasks.completedEmpty')
                  : filter === 'trash'
                    ? t('tasks.trashEmpty')
                    : t('tasks.inboxTagline')}
              </h3>
              {filter !== 'completed' && filter !== 'trash' && <p>{t('tasks.emptyDescription')}</p>}
            </div>
          )}
        </TaskContent>
        {!archive && (
          <div className="task-add-area shrink-0 [padding:var(--task-content-inset)_var(--task-content-inset)_max(var(--task-content-inset),_env(safe-area-inset-bottom))] pe-(--task-content-end-inset) bg-background">
            <QuickAdd
              boundary={contentBoundary}
              key={filter}
              draftKey={filter}
              listId={filter.startsWith('list:') ? filter.slice(5) : undefined}
              date={filter === 'today' ? dateKey() : undefined}
              tag={filter.startsWith('tag:') ? filter.slice(4) : undefined}
            />
          </div>
        )}
        {confirmEmpty && (
          <WorkspaceDialog
            title={t('tasks.emptyTrash')}
            onClose={() => setConfirmEmpty(false)}
            footer={
              <>
                <Button
                  variant="ghost"
                  onClick={() => setConfirmEmpty(false)}
                  className={
                    'h-(--control-height) min-w-18 text-muted-foreground hover:text-foreground'
                  }
                >
                  {t('common.cancel')}
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => {
                    const result = taskActions.purge(
                      data.tasks.filter((task) => task.deleted).map((task) => task.id),
                      false,
                    );

                    if (result.status === 'applied') {
                      selectTask(null);
                      setConfirmEmpty(false);
                    }
                  }}
                  className={
                    'h-(--control-height) min-w-18 bg-button-destructive text-destructive-foreground hover:bg-button-destructive-hover'
                  }
                >
                  {t('tasks.purge')}
                </Button>
              </>
            }
            description={t('tasks.emptyTrashConfirmation')}
          ></WorkspaceDialog>
        )}
      </div>
    </section>
  );
}
