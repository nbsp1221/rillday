import { Button } from '@repo/ui/components/button';
import {
  ArrowDown,
  ArrowDownToLine,
  ArrowUp,
  ArrowUpToLine,
  Copy,
  Pin,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import { type ReactElement, useState } from 'react';
import type { Task } from '#application';
import { useWorkspace } from '#entities/workspace';
import { useI18n } from '#shared/i18n';
import { WorkspaceContextActions } from '#shared/ui/WorkspaceActions';
import { WorkspaceDialog } from '#shared/ui/WorkspaceDialog';

interface TaskRowMovement {
  position: number;
  count: number;
  move: (direction: 'up' | 'down' | 'first' | 'last') => void;
}

export function TaskRowContextMenu({
  task,
  reorder,
  children,
}: {
  task: Task;
  reorder?: TaskRowMovement;
  children: ReactElement;
}) {
  const { t } = useI18n();
  const { taskActions, selectTask, deleteTask } = useWorkspace();
  const [confirmDelete, setConfirmDelete] = useState(false);
  const position = reorder?.position ?? -1;

  const moveBy = (direction: Parameters<TaskRowMovement['move']>[0]) => reorder?.move(direction);

  const restore = () => {
    if (taskActions.restore(task.id).status === 'applied') {
      selectTask(task.id);
    }
  };

  const items = task.deleted
    ? [
        {
          label: t('common.restore'),
          icon: <RotateCcw className="size-3.5 inline-block shrink-0 align-middle" />,
          action: restore,
        },
        {
          label: t('tasks.purgeOption'),
          icon: <Trash2 className="size-3.5 inline-block shrink-0 align-middle" />,
          destructive: true,
          action: () => setConfirmDelete(true),
        },
      ]
    : [
        ...(reorder
          ? [
              {
                label: t('tasks.moveUp'),
                icon: <ArrowUp className="size-3.5 inline-block shrink-0 align-middle" />,
                disabled: position <= 0,
                action: () => moveBy('up'),
              },
              {
                label: t('tasks.moveDown'),
                icon: <ArrowDown className="size-3.5 inline-block shrink-0 align-middle" />,
                disabled: position === reorder.count - 1,
                action: () => moveBy('down'),
              },
              {
                label: t('tasks.moveFirst'),
                icon: <ArrowUpToLine className="size-3.5 inline-block shrink-0 align-middle" />,
                disabled: position <= 0,
                action: () => moveBy('first'),
              },
              {
                label: t('tasks.moveLast'),
                icon: <ArrowDownToLine className="size-3.5 inline-block shrink-0 align-middle" />,
                disabled: position === reorder.count - 1,
                action: () => moveBy('last'),
              },
            ]
          : []),
        {
          label: task.pinned ? t('tasks.unpin') : t('tasks.pin'),
          icon: <Pin className="size-3.5 inline-block shrink-0 align-middle" />,
          action: () => taskActions.update(task.id, { pinned: !task.pinned }),
        },
        {
          label: t('tasks.duplicate'),
          icon: <Copy className="size-3.5 inline-block shrink-0 align-middle" />,
          action: () => {
            const result = taskActions.duplicate(task.id, t('tasks.copyName', { v0: task.title }));

            if (result.status === 'applied') {
              selectTask(result.value);
            }
          },
        },
        {
          label: t('tasks.moveToTrash'),
          icon: <Trash2 className="size-3.5 inline-block shrink-0 align-middle" />,
          destructive: true,
          action: () => deleteTask(task.id),
        },
      ];

  return (
    <>
      <WorkspaceContextActions label={t('tasks.namedMenu', { v0: task.title })} items={items}>
        {children}
      </WorkspaceContextActions>
      {confirmDelete && (
        <WorkspaceDialog
          title={t('tasks.purge')}
          onClose={() => setConfirmDelete(false)}
          footer={
            <>
              <Button
                variant="ghost"
                onClick={() => setConfirmDelete(false)}
                className={
                  'h-(--control-height) min-w-18 text-muted-foreground hover:text-foreground'
                }
              >
                {t('common.cancel')}
              </Button>
              <Button
                variant="destructive"
                onClick={() => {
                  if (taskActions.purge([task.id]).status === 'applied') {
                    selectTask(null);
                    setConfirmDelete(false);
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
          description={t('tasks.purgeConfirmation')}
        ></WorkspaceDialog>
      )}
    </>
  );
}
