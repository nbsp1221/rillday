import { pointerIntersection } from '@dnd-kit/collision';
import { type DragMoveEvent, useDragDropMonitor, useDroppable } from '@dnd-kit/react';
import { type ReactNode, useId, useRef, useState } from 'react';
import type { Task } from '#application';
import { useI18n } from '#shared/i18n';

export type TaskPlacement = 'before' | 'after';
export type ReorderTask = (from: string, to: string, placement: TaskPlacement) => void;

export interface TaskReorderState {
  scope: string;
  target: string | null;
  edge: TaskPlacement;
  move: ReorderTask;
  tasks: Task[];
}

// dnd-kit owns sensors, collision detection, scrolling and cancellation. This adapter
// maps a measured row edge to the product's existing manual-order command.
export function TaskReorder({
  tasks,
  move,
  children,
}: {
  tasks: Task[];
  move: ReorderTask;
  children: (state: TaskReorderState) => ReactNode;
}) {
  const scopeId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const { t } = useI18n();
  const [intent, setIntent] = useState<{ target: string; edge: TaskPlacement } | null>(null);
  useDroppable({
    id: `task-order:${scopeId}`,
    accept: 'task',
    element: rootRef,
    collisionDetector: pointerIntersection,
    collisionPriority: 1,
    data: { reorderScope: scopeId },
  });

  function locate(operation: DragMoveEvent['operation'], point = operation.position.current) {
    const source = tasks.find((task) => task.id === operation.source?.data.taskId);
    const drop = operation.target;
    const box = drop?.shape?.boundingRectangle;
    if (
      !source ||
      drop?.data.reorderScope !== scopeId ||
      !box ||
      point.x < box.left ||
      point.x >= box.right ||
      point.y < box.top ||
      point.y >= box.bottom
    ) {
      return null;
    }
    let target = tasks.find((task) => task.id === drop.data.orderTaskId);
    let edge: TaskPlacement = 'before';
    if (target) {
      edge = point.y < box.top + box.height / 2 ? 'before' : 'after';
    } else {
      const rows = Array.from(
        rootRef.current?.querySelectorAll<HTMLElement>(':scope > .task-row') ?? [],
      );
      const row = rows.find((row) => point.y < row.getBoundingClientRect().bottom) ?? rows.at(-1);
      target = tasks.find((task) => task.id === row?.dataset.taskId);
      if (row) {
        edge =
          point.y < row.getBoundingClientRect().top + row.getBoundingClientRect().height / 2
            ? 'before'
            : 'after';
      }
    }
    if (!target || target.pinned !== source.pinned) {
      return null;
    }
    const ids = tasks.filter((task) => task.pinned === source.pinned).map((task) => task.id);
    const before = ids.join();
    ids.splice(ids.indexOf(source.id), 1);
    ids.splice(ids.indexOf(target.id) + (edge === 'after' ? 1 : 0), 0, source.id);
    if (source.id === target.id || ids.join() === before) {
      return null;
    }
    return { target: target.id, edge };
  }

  function show(next: ReturnType<typeof locate>) {
    setIntent((current) =>
      current?.target === next?.target && current?.edge === next?.edge ? current : next,
    );
  }

  useDragDropMonitor({
    onDragOver(event) {
      show(locate(event.operation));
    },
    onDragMove(event) {
      if (event.defaultPrevented) {
        return;
      }
      const p = event.operation.position.current;
      show(
        locate(
          event.operation,
          event.to ?? { x: p.x + (event.by?.x ?? 0), y: p.y + (event.by?.y ?? 0) },
        ),
      );
    },
    onDragEnd(event) {
      const next = locate(event.operation);
      const id: unknown = event.operation.source?.data.taskId;
      if (!event.canceled && next && typeof id === 'string') {
        move(id, next.target, next.edge);
      }
      show(null);
    },
  });
  const target = tasks.find((task) => task.id === intent?.target);
  return (
    <div
      ref={rootRef}
      className="task-items flex flex-col gap-0.5 min-w-0 task-items-reorderable pb-3 -mb-3"
    >
      {children({
        scope: scopeId,
        target: intent?.target ?? null,
        edge: intent?.edge ?? 'before',
        move,
        tasks,
      })}
      <span
        className="task-drag-announcement fixed top-0 left-0 w-[1px] h-[1px] overflow-hidden [clip-path:inset(50%)] whitespace-nowrap"
        aria-live="polite"
      >
        {target &&
          t(intent?.edge === 'before' ? 'drag.beforeTask' : 'drag.afterTask', {
            title: target.title,
          })}
      </span>
    </div>
  );
}
