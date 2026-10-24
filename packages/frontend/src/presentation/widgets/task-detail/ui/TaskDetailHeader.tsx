import { Button as ButtonPrimitive } from '@base-ui/react/button';
import { Button } from '@repo/ui/components/button';
import {
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
} from '@repo/ui/components/dropdown-menu';
import { Toggle } from '@repo/ui/components/toggle';
import { cn } from 'cn';
import { ChevronDown, Copy, List, MoreHorizontal, Pin, RotateCcw, Trash2, X } from 'lucide-react';
import type { Task } from '#application';
import { useWorkspace } from '#entities/workspace';
import { useI18n } from '#shared/i18n';
import { WorkspaceDialog } from '#shared/ui/WorkspaceDialog';
import { TaskDetailMenu, type TaskDetailPopoverControls } from './TaskDetailMenu';

export function TaskDetailHeader({
  task,
  popovers,
  restoreTask,
  onDeleteRequest,
}: {
  task: Task;
  popovers: TaskDetailPopoverControls;
  restoreTask: () => void;
  onDeleteRequest: () => void;
}) {
  const { t } = useI18n();
  const { data, taskActions, selectTask, deleteTask } = useWorkspace();
  const currentList = data.lists.find((list) => list.id === task.listId);
  const taskMenu = (
    <>
      {!task.deleted ? (
        <>
          <DropdownMenuItem
            className={cn(
              'workspace-option',
              'td-menu-item flex items-center gap-2 w-full min-h-8 py-1.5 px-2 bg-transparent border-0 rounded-sm text-left text-sm text-inherit leading-(--text-sm--line-height) [&_span]:flex-1 [&_span]:min-w-0 [&_span]:overflow-hidden [&_span]:text-ellipsis [&_span]:whitespace-nowrap',
            )}
            onClick={() => {
              const result = taskActions.duplicate(
                task.id,
                t('tasks.copyName', { v0: task.title }),
              );

              if (result.status === 'applied') {
                popovers.close();
                selectTask(result.value);
              }
            }}
          >
            <Copy className="size-3.5 inline-block shrink-0 align-middle" />
            <span>{t('tasks.duplicate')}</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            className={cn(
              'workspace-option',
              'td-menu-item flex items-center gap-2 w-full min-h-8 py-1.5 px-2 bg-transparent border-0 rounded-sm text-left text-sm text-inherit leading-(--text-sm--line-height) [&_span]:flex-1 [&_span]:min-w-0 [&_span]:overflow-hidden [&_span]:text-ellipsis [&_span]:whitespace-nowrap td-danger text-danger-text',
            )}
            onClick={() => {
              if (deleteTask(task.id).status === 'applied') {
                popovers.setActive(null);
              }
            }}
          >
            <Trash2 className="size-3.5 inline-block shrink-0 align-middle" />
            <span>{t('tasks.moveToTrash')}</span>
          </DropdownMenuItem>
        </>
      ) : (
        <>
          <DropdownMenuItem
            className={cn(
              'workspace-option',
              'td-menu-item flex items-center gap-2 w-full min-h-8 py-1.5 px-2 bg-transparent border-0 rounded-sm text-left text-sm text-inherit leading-(--text-sm--line-height) [&_span]:flex-1 [&_span]:min-w-0 [&_span]:overflow-hidden [&_span]:text-ellipsis [&_span]:whitespace-nowrap',
            )}
            onClick={restoreTask}
          >
            <RotateCcw className="size-3.5 inline-block shrink-0 align-middle" />
            <span>{t('common.restore')}</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            className={cn(
              'workspace-option',
              'td-menu-item flex items-center gap-2 w-full min-h-8 py-1.5 px-2 bg-transparent border-0 rounded-sm text-left text-sm text-inherit leading-(--text-sm--line-height) [&_span]:flex-1 [&_span]:min-w-0 [&_span]:overflow-hidden [&_span]:text-ellipsis [&_span]:whitespace-nowrap td-danger text-danger-text',
            )}
            onClick={() => {
              popovers.close();
              onDeleteRequest();
            }}
          >
            <Trash2 className="size-3.5 inline-block shrink-0 align-middle" />
            <span>{t('tasks.purgeOption')}</span>
          </DropdownMenuItem>
        </>
      )}
    </>
  );

  return (
    <header className="td-header flex items-center gap-1 py-0 px-(--detail-inset) h-8 mb-(--detail-inset) shrink-0">
      <div className="td-anchor relative flex items-center td-list-anchor flex-1 min-w-0">
        <TaskDetailMenu
          popovers={popovers}
          kind={'list'}
          label={t('tasks.moveToList')}
          trigger={
            <ButtonPrimitive
              data-detail-trigger
              aria-haspopup="menu"
              aria-label={t('tasks.moveToList')}
              aria-expanded={popovers.active === 'list'}
              disabled={task.deleted}
              className={
                'td-list-button flex items-center gap-[7px] bg-transparent border-0 py-[5px] px-0 text-xs text-muted-foreground max-w-full min-w-0 leading-(--text-xs--line-height) [&_span]:overflow-hidden [&_span]:text-ellipsis [&_span]:whitespace-nowrap hover:text-foreground'
              }
            >
              <List className="size-3.5 inline-block shrink-0 align-middle" />
              <span>
                {!currentList || currentList.id === 'inbox' ? t('lists.inbox') : currentList.name}
              </span>
              <ChevronDown className="size-3 inline-block shrink-0 align-middle" />
            </ButtonPrimitive>
          }
        >
          <DropdownMenuGroup>
            <DropdownMenuLabel className="td-popover-title py-1.5 px-2 text-xs text-muted-foreground leading-(--text-xs--line-height)">
              {t('tasks.moveToList')}
            </DropdownMenuLabel>
            <DropdownMenuRadioGroup value={task.listId}>
              {data.lists.map((list) => (
                <DropdownMenuRadioItem
                  value={list.id}
                  className={cn(
                    'workspace-option',
                    'td-menu-item flex items-center gap-2 w-full min-h-8 py-1.5 px-2 bg-transparent border-0 rounded-sm text-left text-sm text-inherit leading-(--text-sm--line-height) [&_span]:flex-1 [&_span]:min-w-0 [&_span]:overflow-hidden [&_span]:text-ellipsis [&_span]:whitespace-nowrap',
                  )}
                  key={list.id}
                  onClick={() => {
                    taskActions.moveToList(task.id, list.id);
                    popovers.close();
                  }}
                >
                  <List
                    style={{ color: list.color }}
                    className="size-3.5 inline-block shrink-0 align-middle"
                  />
                  <span>{list.id === 'inbox' ? t('lists.inbox') : list.name}</span>
                </DropdownMenuRadioItem>
              ))}
            </DropdownMenuRadioGroup>
          </DropdownMenuGroup>
        </TaskDetailMenu>
      </div>
      <Toggle
        size="sm"
        className="td-icon-button inline-flex items-center justify-center w-8 h-8 shrink-0 border-0 rounded-sm bg-transparent text-muted-foreground p-0 hover:bg-surface-hover hover:text-foreground td-pin-toggle [&[aria-pressed='true']]:text-foreground [&[aria-pressed='true']]:bg-surface-selected [&[aria-pressed='true']_>_svg]:[fill:currentColor]"
        aria-label={t('tasks.pinToTop')}
        pressed={task.pinned}
        title={task.pinned ? t('tasks.unpin') : t('tasks.pinToTop')}
        disabled={task.deleted}
        onPressedChange={(pinned) => taskActions.update(task.id, { pinned })}
      >
        <Pin className="size-4 inline-block shrink-0 align-middle" />
      </Toggle>
      <div className="td-anchor relative flex items-center">
        <TaskDetailMenu
          popovers={popovers}
          kind={'actions'}
          label={t('tasks.actions')}
          trigger={
            <ButtonPrimitive
              data-detail-trigger
              aria-haspopup="menu"
              aria-label={t('tasks.actionsMenu')}
              aria-expanded={popovers.active === 'actions'}
              className={
                'td-icon-button inline-flex items-center justify-center w-8 h-8 shrink-0 border-0 rounded-sm bg-transparent text-muted-foreground p-0 hover:bg-surface-hover hover:text-foreground'
              }
            >
              <MoreHorizontal className="size-4 inline-block shrink-0 align-middle" />
            </ButtonPrimitive>
          }
        >
          {taskMenu}
        </TaskDetailMenu>
      </div>
      <ButtonPrimitive
        aria-label={t('tasks.closeDetails')}
        title={t('tasks.closeDetailsShortcut')}
        onClick={() => selectTask(null)}
        className={
          'td-icon-button inline-flex items-center justify-center w-8 h-8 shrink-0 border-0 rounded-sm bg-transparent text-muted-foreground p-0 hover:bg-surface-hover hover:text-foreground'
        }
      >
        <X className="size-4 inline-block shrink-0 align-middle" />
      </ButtonPrimitive>
    </header>
  );
}

export function TaskDetailDeleteConfirmation({
  taskId,
  close,
}: {
  taskId: string;
  close: () => void;
}) {
  const { t } = useI18n();
  const { taskActions, selectTask } = useWorkspace();

  const removeForever = () => {
    if (taskActions.purge([taskId]).status === 'applied') {
      selectTask(null);
    }
  };

  return (
    <WorkspaceDialog
      title={t('tasks.purge')}
      description={t('tasks.purgeDescription')}
      onClose={close}
      footer={
        <>
          <Button
            variant="ghost"
            onClick={close}
            className={'h-(--control-height) min-w-18 text-muted-foreground hover:text-foreground'}
          >
            {t('common.cancel')}
          </Button>
          <Button
            variant="destructive"
            onClick={removeForever}
            className={
              'h-(--control-height) min-w-18 bg-button-destructive text-destructive-foreground hover:bg-button-destructive-hover'
            }
          >
            {t('tasks.purge')}
          </Button>
        </>
      }
    />
  );
}
