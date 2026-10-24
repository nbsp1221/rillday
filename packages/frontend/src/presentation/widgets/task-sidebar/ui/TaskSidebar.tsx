import { Button as ButtonPrimitive } from '@base-ui/react/button';
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog';
import { useDragDropMonitor } from '@dnd-kit/react';
import { Collapsible, CollapsibleContent } from '@repo/ui/components/collapsible';
import { Sheet, SheetTitle } from '@repo/ui/components/sheet';
import { cn } from 'cn';
import { List, Tag, X } from 'lucide-react';
import { Fragment, type RefObject } from 'react';
import {
  type Task,
  type TaskList,
  dateKey,
  workspaceLabelColor,
  workspaceLabels,
} from '#application';
import { taskScopes } from '#entities/task';
import { useWorkspace } from '#entities/workspace';
import { useI18n } from '#shared/i18n';
import { SidebarEntityRow } from './SidebarEntityRow';
import { SidebarTaskTarget } from './SidebarTaskTarget';
import { TaskSidebarSection } from './TaskSidebarSection';

export function TaskSidebar({
  filter,
  navigate,
  editLabel,
  editList,
  mobile,
  expanded,
  close,
  portalContainer,
  groups,
  setGroupExpanded,
}: {
  filter: string;
  navigate: (filter: string) => void;
  editList: (list: TaskList | 'new') => void;
  editLabel: (name?: string) => void;
  mobile: boolean;
  expanded: boolean;
  close: () => void;
  portalContainer: RefObject<HTMLDivElement | null>;
  groups: {
    lists: boolean;
    labels: boolean;
  };
  setGroupExpanded: (group: 'lists' | 'labels', expanded: boolean) => void;
}) {
  const { data, taskActions, deleteTask, notify } = useWorkspace();
  const { t } = useI18n();
  useDragDropMonitor({
    onDragEnd(event) {
      if (event.canceled) {
        return;
      }

      const drop = event.operation.target;
      const scope: unknown = drop?.data.sidebarScope;
      const id: unknown = event.operation.source?.data.taskId;
      const point = event.operation.position.current;
      const box = drop?.shape?.boundingRectangle;

      if (
        typeof scope !== 'string' ||
        typeof id !== 'string' ||
        !box ||
        point.x < box.left ||
        point.x >= box.right ||
        point.y < box.top ||
        point.y >= box.bottom
      ) {
        return;
      }

      const task = data.tasks.find((item) => item.id === id);

      if (!task || task.deleted || task.completedAt) {
        return;
      }

      if (scope === 'trash') {
        deleteTask(id);
      } else if (scope === 'completed') {
        taskActions.toggle(id);
      } else if (scope.startsWith('list:')) {
        const list = data.lists.find((list) => list.id === scope.slice(5));
        const result = taskActions.moveToList(id, scope.slice(5));

        if (result.status === 'applied' && list) {
          notify(
            t('tasks.movedToList', {
              name: list.id === 'inbox' ? t('lists.inbox') : list.name,
            }),
            { undoable: true },
          );
        }
      }
    },
  });
  const tags = workspaceLabels(data);

  const count = (predicate: (task: Task) => boolean) => {
    const items = data.tasks.filter(
      (task) => !task.deleted && !task.completedAt && predicate(task),
    );
    const ids = new Set(items.map((task) => task.id));

    return items.filter((task) => !task.parentId || !ids.has(task.parentId)).length;
  };

  function scopeCount(id: string) {
    switch (id) {
      case 'all':
        return count(() => true);
      case 'today':
        return count((task) => task.date !== null && task.date <= dateKey());
      case 'list:inbox':
        return count((task) => task.listId === 'inbox');
      default:
        return undefined;
    }
  }

  const content = (
    <>
      {mobile && (
        <header className="task-sidebar-sheet-header flex items-center justify-between shrink-0 h-(--workspace-header-height) [padding:0_var(--sidebar-content-inset)_0_calc(var(--sidebar-content-inset)_+_11px)] [&_h2]:m-0 [&_h2]:text-base [&_h2]:leading-(--text-base--line-height) [&_h2]:font-semibold">
          <SheetTitle render={<h2 />}>{t('tasks.titlePlural')}</SheetTitle>
          <ButtonPrimitive
            aria-label={t('lists.close')}
            onClick={close}
            className={
              'task-sidebar-close grid place-items-center w-(--workspace-control-size) h-(--workspace-control-size) shrink-0 p-0 rounded-md text-muted-foreground'
            }
          >
            <X className="size-4.5 inline-block shrink-0 align-middle" />
          </ButtonPrimitive>
        </header>
      )}
      <nav
        className="sidebar-scroll overflow-auto [&::-webkit-scrollbar]:size-[7px] [&::-webkit-scrollbar-thumb]:rounded-lg [&::-webkit-scrollbar-thumb]:bg-scrollbar [&::-webkit-scrollbar-thumb:hover]:bg-scrollbar-hover p-(--sidebar-content-inset) flex-1"
        aria-label={t('tasks.navigation')}
      >
        <div className="sidebar-items flex flex-col gap-1 [.sidebar-group-inner_&]:pt-1 smart-lists pb-(--sidebar-section-separation) [border-bottom:1px_solid_var(--separator)]">
          {taskScopes.map((scope) => {
            const number = scopeCount(scope.id);

            return (
              <Fragment key={scope.id}>
                {scope.id === 'completed' && (
                  <div
                    className="sidebar-divider shrink-0 h-[1px] bg-separator my-[calc(var(--sidebar-section-separation)_-_var(--spacing))]"
                    role="separator"
                  />
                )}
                <SidebarTaskTarget
                  scope={
                    scope.id === 'list:inbox' || scope.id === 'completed' || scope.id === 'trash'
                      ? scope.id
                      : undefined
                  }
                  name={t(scope.label, { context: scope.context })}
                >
                  {(dropProps) => (
                    <ButtonPrimitive
                      {...dropProps}
                      aria-current={filter === scope.id ? 'page' : undefined}
                      onClick={() => navigate(scope.id)}
                      className={cn(
                        "sidebar-item [&[data-drop-active]]:[background:color-mix(in_srgb,_var(--link)_14%,_var(--sidebar))] [&[data-task-drop='trash'][data-drop-active]]:[background:color-mix(in_srgb,_var(--destructive)_14%,_var(--sidebar))] [&[data-task-drop='trash'][data-drop-active]]:text-danger-text relative w-full flex items-center gap-3 h-(--sidebar-row-height) py-0 px-[11px] text-foreground rounded-md text-left text-sm m-0 leading-(--text-sm--line-height) [&_svg]:text-muted-foreground [&_span]:flex-1 [&_span]:overflow-hidden [&_span]:whitespace-nowrap [&_span]:text-ellipsis [&_small]:absolute [&_small]:right-(--sidebar-trailing-inset) [&_small]:top-[50%] [&_small]:[transform:translateY(-50%)] [&_small]:w-(--sidebar-trailing-size) [&_small]:h-(--sidebar-trailing-size) [&_small]:grid [&_small]:place-items-center [&_small]:text-xs [&_small]:tabular-nums [&_small]:text-muted-foreground [&_small]:leading-(--text-xs--line-height) [&:has(>_small)]:pr-[calc(var(--sidebar-trailing-size)_+_var(--sidebar-trailing-inset)_*_2)]",
                        filter === scope.id
                          ? 'active [background:color-mix(in_srgb,_var(--primary)_8%,_transparent)] text-foreground [&_svg]:text-link'
                          : '',
                      )}
                    >
                      <scope.icon className="size-4.5 inline-block shrink-0 align-middle" />
                      <span>{t(scope.label, { context: scope.context })}</span>
                      {Boolean(number) && <small>{number}</small>}
                    </ButtonPrimitive>
                  )}
                </SidebarTaskTarget>
              </Fragment>
            );
          })}
        </div>
        <TaskSidebarSection
          className="mt-4"
          title={t('lists.title')}
          expanded={groups.lists}
          setExpanded={(value) => setGroupExpanded('lists', value)}
          createLabel={t('lists.add')}
          create={() => editList('new')}
          emptyLabel={data.lists.every((list) => list.id === 'inbox') ? t('lists.new') : undefined}
        >
          <div className="sidebar-items flex flex-col gap-1 [.sidebar-group-inner_&]:pt-1">
            {data.lists
              .filter((list) => list.id !== 'inbox')
              .map((list) => (
                <SidebarTaskTarget key={list.id} scope={`list:${list.id}`} name={list.name}>
                  {(dropProps) => (
                    <SidebarEntityRow
                      {...dropProps}
                      kind="list"
                      name={list.name}
                      icon={List}
                      color={list.color}
                      count={count((task) => task.listId === list.id)}
                      selected={filter === `list:${list.id}`}
                      navigate={() => navigate(`list:${list.id}`)}
                      editLabel={t('lists.editNamed', { v0: list.name })}
                      edit={() => editList(list)}
                    />
                  )}
                </SidebarTaskTarget>
              ))}
          </div>
        </TaskSidebarSection>
        <TaskSidebarSection
          title={t('labels.title')}
          expanded={groups.labels}
          setExpanded={(value) => setGroupExpanded('labels', value)}
          createLabel={t('labels.create')}
          create={() => editLabel()}
          emptyLabel={!tags.length ? t('labels.new') : undefined}
        >
          <div className="sidebar-items flex flex-col gap-1 [.sidebar-group-inner_&]:pt-1">
            {tags.map((tag) => (
              <SidebarEntityRow
                key={tag}
                kind="label"
                name={tag}
                icon={Tag}
                color={workspaceLabelColor(data, tag)}
                count={count((task) => task.tags.includes(tag))}
                selected={filter === `tag:${tag}`}
                navigate={() => navigate(`tag:${tag}`)}
                editLabel={t('labels.editNamed', { name: tag })}
                edit={() => editLabel(tag)}
              />
            ))}
          </div>
        </TaskSidebarSection>
      </nav>
    </>
  );

  return mobile ? (
    <Sheet
      open={expanded}
      onOpenChange={(open) => {
        if (!open) {
          close();
        }
      }}
    >
      <DialogPrimitive.Portal container={portalContainer}>
        <DialogPrimitive.Backdrop className="fixed inset-0 z-50 bg-overlay" />
        <DialogPrimitive.Popup
          id="task-context-sidebar"
          className="task-sidebar [--context-sidebar-width:var(--sidebar-width)] [--sidebar-content-inset:calc(var(--spacing)_*_2.5)] [--sidebar-trailing-size:calc(var(--spacing)_*_7)] [--sidebar-trailing-inset:var(--spacing)] [--sidebar-section-separation:calc(var(--spacing)_*_4)] shrink-0 bg-background flex flex-col min-h-0 [.workspace-sidebar-panel_>_&]:h-full task-sidebar-sheet fixed z-50 inset-[0_auto_0_var(--app-rail-width)] m-0 w-[min(var(--sidebar-width),_calc(100vw_-_var(--app-rail-width)_-_16px))] h-dvh max-w-[none] max-h-[none] p-0 border-0 [border-right:1px_solid_var(--separator)] text-foreground outline-none transition duration-200 ease-in-out data-starting-style:-translate-x-10 data-starting-style:opacity-0 data-ending-style:-translate-x-10 data-ending-style:opacity-0 motion-reduce:transition-none"
          aria-label={t('tasks.navigation')}
          aria-labelledby={undefined}
          aria-modal="true"
          aria-describedby={undefined}
        >
          {content}
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </Sheet>
  ) : (
    <Collapsible
      render={<aside />}
      id="task-context-sidebar"
      className="task-sidebar [--context-sidebar-width:var(--sidebar-width)] [--sidebar-content-inset:calc(var(--spacing)_*_2.5)] [--sidebar-trailing-size:calc(var(--spacing)_*_7)] [--sidebar-trailing-inset:var(--spacing)] [--sidebar-section-separation:calc(var(--spacing)_*_4)] w-full overflow-clip shrink-0 bg-background relative flex flex-col min-h-0 [.workspace-sidebar-panel_>_&]:h-full"
      open={expanded}
      inert={!expanded}
      aria-hidden={!expanded}
    >
      <CollapsibleContent
        keepMounted
        className="collapsible-sidebar w-(--collapsible-panel-width) max-w-full h-full overflow-clip transition-[width] duration-200 ease-[ease] data-starting-style:w-0 data-ending-style:w-0 motion-reduce:transition-none"
      >
        <div className="collapsible-sidebar-inner flex h-full min-h-0 w-(--sidebar-width) flex-col border-r border-separator">
          {content}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
