import { Button as ButtonPrimitive } from '@base-ui/react/button';
import { Checkbox as CompletionCheckbox } from '@base-ui/react/checkbox';
import { pointerIntersection } from '@dnd-kit/collision';
import { KeyboardSensor, PointerActivationConstraints, PointerSensor } from '@dnd-kit/dom';
import { useDraggable, useDroppable } from '@dnd-kit/react';
import { Input } from '@repo/ui/components/input';
import { cn } from 'cn';
import { ChevronDown, ChevronRight, Check as CompletionCheck, Pin, Repeat2 } from 'lucide-react';
import { type CSSProperties, useLayoutEffect, useRef, useState } from 'react';
import { type Task, workspaceLabelColor } from '#application';
import { TaskMetadataToken, taskDateTone } from '#entities/task';
import { useWorkspace } from '#entities/workspace';
import { useI18n } from '#shared/i18n';
import { useTaskRowKeyboard } from '../model/use-task-row-keyboard';
import type { TaskReorderState } from './TaskReorder';
import { TaskRowContextMenu } from './TaskRowContextMenu';

const taskRowSensors = [
  PointerSensor.configure({
    activatorElements: (source) => [source.element],
    preventActivation: (event, source) =>
      source.data.canDrag === false ||
      Boolean(PointerSensor.defaults.preventActivation?.(event, source)),
    activationConstraints: (event) =>
      event.pointerType === 'touch'
        ? [new PointerActivationConstraints.Delay({ value: 250, tolerance: 5 })]
        : [new PointerActivationConstraints.Distance({ value: 4 })],
  }),
  KeyboardSensor.configure({
    preventActivation: (event, source) =>
      event.code !== 'Space' ||
      source.data.canDrag === false ||
      KeyboardSensor.defaults.preventActivation(event, source),
  }),
];

export function TaskRow({
  task,
  compact = false,
  indent = 0,
  showList = false,
  reorder,
  showChildren = true,
}: {
  task: Task;
  compact?: boolean;
  indent?: number;
  showList?: boolean;
  reorder?: TaskReorderState;
  showChildren?: boolean;
}) {
  const { t } = useI18n();
  const { data, selectedTaskId, selectTask, taskActions } = useWorkspace();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(task.title);
  const [expanded, setExpanded] = useState(false);
  const DisclosureIcon = expanded ? ChevronDown : ChevronRight;
  const [tall, setTall] = useState(false);
  const canceledEditRef = useRef(false);
  const rowRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const canDrag = !editing && !task.deleted && !task.completedAt;
  const { isDragSource } = useDraggable({
    id: task.id,
    type: 'task',
    data: {
      taskId: task.id,
      title: task.title,
      listId: task.listId,
      canDrag,
    },
    element: rowRef,
    handle: contentRef,
    // Sensors gate dragging; the row must still open completed or deleted tasks.
    sensors: taskRowSensors,
  });
  useDroppable({
    id: `row:${task.id}`,
    accept: 'task',
    element: rowRef,
    disabled: !reorder,
    collisionDetector: pointerIntersection,
    data: { reorderScope: reorder?.scope, orderTaskId: task.id },
  });
  const peers = reorder?.tasks.filter((item) => item.pinned === task.pinned) ?? [];
  const position = peers.findIndex((item) => item.id === task.id);

  function moveBy(direction: 'up' | 'down' | 'first' | 'last') {
    const target =
      direction === 'first'
        ? peers[0]
        : direction === 'last'
          ? peers.at(-1)
          : peers[position + (direction === 'up' ? -1 : 1)];

    if (target && target.id !== task.id) {
      reorder?.move(
        task.id,
        target.id,
        direction === 'up' || direction === 'first' ? 'before' : 'after',
      );
    }
  }

  const children = showChildren
    ? data.tasks.filter((item) => item.parentId === task.id && !item.deleted)
    : [];
  const list = data.lists.find((item) => item.id === task.listId);
  const parent = data.tasks.find((item) => item.id === task.parentId);
  const listVisible = !compact && showList && list && (!indent || parent?.listId !== task.listId);
  const childrenId = `task-children-${task.id}`;
  useLayoutEffect(() => {
    const element = contentRef.current;

    if (!element) {
      return;
    }

    const measure = () => {
      // eslint-disable-next-line @eslint-react/set-state-in-effect -- Set measured alignment before paint.
      setTall(hasMultilineContent(element));
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);

    return () => observer.disconnect();
  }, [editing]);

  function finish() {
    if (canceledEditRef.current) {
      canceledEditRef.current = false;
      setText(task.title);
      setEditing(false);

      return;
    }

    const value = text.trim();

    if (value && value !== task.title) {
      if (taskActions.update(task.id, { title: value }).status === 'failed') {
        return false;
      }
    } else {
      setText(task.title);
    }

    setEditing(false);

    return true;
  }

  function startEditing() {
    if (task.deleted) {
      return;
    }

    canceledEditRef.current = false;
    setText(task.title);
    setEditing(true);
  }

  const keyDown = useTaskRowKeyboard(task, startEditing, reorder ? moveBy : undefined);

  return (
    <>
      <TaskRowContextMenu
        task={task}
        anchor={rowRef}
        reorder={reorder ? { position, count: peers.length, move: moveBy } : undefined}
      >
        <div
          ref={rowRef}
          role="group"
          aria-label={task.title}
          tabIndex={0}
          data-task-id={task.id}
          data-drag-enabled={canDrag || undefined}
          data-drop-edge={reorder?.target === task.id ? reorder.edge : undefined}
          className={cn(
            "task-row [--task-depth:0] [--task-control-size:24px] grid grid-cols-[var(--task-control-size)_minmax(0,_1fr)_auto] items-center gap-x-1 min-h-[min(var(--task-row-height),_40px)] p-2 pl-[calc(var(--task-control-size)_+_min(var(--task-depth)_*_20px,_20%))] relative rounded-sm border-0 cursor-default pr-(--task-control-size) focus-visible:[outline:2px_solid_var(--ring)] focus-visible:-outline-offset-2 hover:bg-surface-hover [:root[data-density='compact']_&]:py-1.5 [@media(pointer:_coarse)]:[--task-control-size:28px] [&[data-drop-edge]::after]:[content:''] [&[data-drop-edge]::after]:absolute [&[data-drop-edge]::after]:z-1 [&[data-drop-edge]::after]:left-(--task-control-size) [&[data-drop-edge]::after]:right-(--task-control-size) [&[data-drop-edge]::after]:h-0.5 [&[data-drop-edge]::after]:bg-link [&[data-drop-edge]::after]:rounded-[1px] [&[data-drop-edge]::after]:pointer-events-none [&[data-drop-edge='before']::after]:-top-0.5 [&[data-drop-edge='after']::after]:-bottom-0.5 [.task-items_&]:m-0",
            compact ? 'compact' : '',
            tall ? 'tall items-start' : '',
            selectedTaskId === task.id ? 'selected bg-surface-selected' : '',
            task.completedAt ? 'completed' : '',
            task.deleted ? 'deleted' : '',
            isDragSource ? 'is-dragging opacity-40' : '',
            canDrag ? 'cursor-grab touch-none' : '',
            isDragSource ? 'cursor-grabbing' : '',
          )}
          style={{ '--task-depth': indent } as CSSProperties}
          onFocus={(event) => {
            if (
              event.target === event.currentTarget &&
              event.currentTarget.matches(':focus-visible')
            ) {
              selectTask(task.id);
            }
          }}
          onKeyDown={keyDown}
          onClick={(event) => {
            selectTask(task.id);

            if (!(event.target as HTMLElement).closest('button,input,textarea')) {
              event.currentTarget.focus({ preventScroll: true });
            }
          }}
          onContextMenu={(event) => {
            if ((event.target as HTMLElement).closest('input,textarea')) {
              return;
            }

            selectTask(task.id);
            event.currentTarget.focus({ preventScroll: true });
          }}
        >
          {children.length > 0 && (
            <ButtonPrimitive
              aria-label={expanded ? t('tasks.collapseSubtasks') : t('tasks.expandSubtasks')}
              aria-expanded={expanded}
              aria-controls={childrenId}
              onClick={(event) => {
                event.stopPropagation();
                setExpanded(!expanded);
              }}
              className={
                "subtask-disclosure [.task-row_&]:absolute [.task-row_&]:left-[min(var(--task-depth)_*_20px,_20%)] [.task-row_&]:top-[50%] [.task-row_&]:[transform:translateY(-50%)] [.task-row_&]:grid [.task-row_&]:place-items-center [.task-row_&]:w-(--task-control-size) [.task-row_&]:h-(--task-control-size) [.task-row_&]:p-0 [.task-row_&]:bg-transparent [.task-row_&]:text-muted-foreground [.task-row_&]:rounded-sm [.task-row_&:hover]:text-foreground [.task-row.tall_&]:top-2 [.task-row.tall_&]:[transform:none] [:root[data-density='compact']_.task-row.tall_&]:top-1.5"
              }
            >
              <DisclosureIcon size={16} className="inline-block shrink-0 align-middle" />
            </ButtonPrimitive>
          )}
          <TaskRowCompletion task={task} />
          <div
            className="task-content min-w-0 [padding:2px_0_2px_var(--spacing)] [@media(pointer:_coarse)]:py-1 rounded-sm focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2 [.task-row.is-dragging_&]:outline-none"
            ref={contentRef}
            tabIndex={canDrag ? 0 : -1}
            aria-label={task.title}
            aria-roledescription={t('tasks.task')}
            onKeyDown={(event) => {
              if (event.target === event.currentTarget && event.key === 'Enter') {
                event.preventDefault();
                selectTask(task.id);
              }
            }}
          >
            <div className="task-heading flex items-start gap-1.5 min-w-0">
              {editing ? (
                <Input
                  aria-label={t('tasks.editInline')}
                  autoFocus
                  value={text}
                  onChange={(event) => setText(event.target.value)}
                  onClick={(event) => event.stopPropagation()}
                  onBlur={finish}
                  onKeyDown={(event) => {
                    if (event.nativeEvent.isComposing || event.keyCode === 229) {
                      return;
                    }

                    if (event.key === 'Enter') {
                      event.preventDefault();

                      if (finish()) {
                        requestAnimationFrame(() => rowRef.current?.focus());
                      }
                    }

                    if (event.key === 'Escape') {
                      event.preventDefault();
                      event.stopPropagation();
                      canceledEditRef.current = true;
                      setText(task.title);
                      setEditing(false);
                      requestAnimationFrame(() => rowRef.current?.focus());
                    }
                  }}
                  className={cn(
                    'h-auto min-h-0 rounded-none border-0 bg-transparent p-0 shadow-none text-sm focus-visible:ring-0',
                    'inline-title text-sm leading-(--text-sm--line-height) w-full p-0 border-0 bg-transparent',
                  )}
                />
              ) : (
                <span
                  className="task-title [.task-heading_&]:min-w-0 text-sm leading-(--text-sm--line-height) wrap-anywhere [.task-row.completed_&]:text-muted-foreground [.task-row.completed_&]:line-through"
                  onDoubleClick={startEditing}
                >
                  {task.title}
                </span>
              )}
              {task.pinned && (
                <Pin
                  size={12}
                  className={cn(
                    'inline-block shrink-0 align-middle',
                    'row-pin shrink-0 mt-1 text-muted-foreground',
                  )}
                  aria-label={t('tasks.pinned')}
                />
              )}
            </div>
            {!compact && (
              <div className="task-meta flex items-center gap-2 flex-wrap mt-0 text-muted-foreground text-xs leading-(--text-xs--line-height) [&:empty]:hidden">
                {listVisible && (
                  <TaskMetadataToken
                    kind="list"
                    name={list.id === 'inbox' ? t('lists.inbox') : list.name}
                    color={list.color}
                  />
                )}
                {task.tags.map((tag) => (
                  <TaskMetadataToken key={tag} name={tag} color={workspaceLabelColor(data, tag)} />
                ))}
              </div>
            )}
          </div>
          <div className="row-trailing flex items-center justify-end flex-wrap gap-1 max-w-33 pl-1 text-muted-foreground text-xs leading-(--text-xs--line-height) [.task-row_&]:pr-[calc((var(--task-control-size)_-_16px)_/_2)] [.task-row.tall_&]:items-start [.task-row.tall_&]:pt-1 [.task-row.tall_&_>_svg]:mt-0.5 [@media(pointer:_coarse)]:[.task-row.tall_&]:pt-1.5">
            <TaskRowDate task={task} />
          </div>
        </div>
      </TaskRowContextMenu>
      {children.length > 0 && (
        <div
          id={childrenId}
          className="task-children [.task-items_&:not([hidden])]:flex [.task-items_&:not([hidden])]:flex-col [.task-items_&:not([hidden])]:gap-0.5 [.task-items_&:not([hidden])]:min-w-0"
          hidden={!expanded}
        >
          {expanded &&
            children
              .sort((a, b) => a.order - b.order)
              .map((child) => (
                <TaskRow
                  key={child.id}
                  task={child}
                  compact={compact}
                  showList={showList}
                  indent={indent + 1}
                />
              ))}
        </div>
      )}
    </>
  );
}

function hasMultilineContent(element: HTMLElement) {
  const title = element.querySelector('.task-title,.inline-title');

  if (!title) {
    return false;
  }

  const meta = element.querySelector('.task-meta');

  const lines = (node: Element | null) =>
    node
      ? Math.ceil(
          (node.getBoundingClientRect().height - 0.5) /
            parseFloat(getComputedStyle(node).lineHeight),
        )
      : 0;

  return lines(title) + lines(meta) > 2;
}

function TaskRowDate({ task }: { task: Task }) {
  const { t, formatDate, formatTime } = useI18n();
  const dateTone = taskDateTone(task);

  return (
    <span className="row-date-group flex items-center justify-end gap-1 [.task-row.tall_&]:items-start [.task-row.tall_&_>_svg]:mt-0.5">
      {task.repeat && (
        <Repeat2
          aria-label={t('dates.repeat')}
          className="size-3 inline-block shrink-0 align-middle"
        />
      )}{' '}
      {task.date && (
        <time
          className="row-date flex flex-col items-end whitespace-nowrap task-date [--date-today:var(--link)] [--date-overdue:var(--danger-text)] [--date-neutral:color-mix(in_srgb,_var(--muted-foreground)_90%,_var(--foreground))] [--date-color:var(--date-neutral)] [&[data-date-tone='today']]:[--date-color:var(--date-today)] [&[data-date-tone='overdue']]:[--date-color:var(--date-overdue)] text-date-color"
          data-date-tone={dateTone}
          dateTime={`${task.date}${task.time ? `T${task.time}` : ''}`}
          title={t('dates.dateTime', {
            context: dateTone === 'overdue' ? 'overdue' : undefined,
            date: task.date,
            time: task.time ? ` ${formatTime(task.time)}` : '',
          })}
          aria-description={dateTone === 'overdue' ? t('tasks.overdue') : undefined}
        >
          <span>{formatDate(task.date)}</span>
          {task.time && <span>{formatTime(task.time)}</span>}
        </time>
      )}
    </span>
  );
}

function TaskRowCompletion({ task }: { task: Task }) {
  const { t } = useI18n();
  const { taskActions } = useWorkspace();

  return (
    <CompletionCheckbox.Root
      render={<button type="button" />}
      nativeButton
      className={cn(
        "task-check [--check-color:var(--muted-foreground)] relative w-(--task-control-size) h-(--task-control-size) p-0 grid place-items-center border-0 bg-transparent rounded-sm text-primary-foreground [&::before]:[content:''] [&::before]:absolute [&::before]:inset-1 [&::before]:border [&::before]:border-(--check-color) [&::before]:rounded-full [&::before]:[background:color-mix(in_srgb,_var(--check-color)_3.92%,_transparent)] active:bg-transparent hover:bg-transparent [&:not(.checked,_:disabled):hover::before]:[background:color-mix(in_srgb,_var(--check-color)_16%,_transparent)] focus-visible:outline-none [&:focus-visible::before]:[outline:2px_solid_var(--ring)] [&:focus-visible::before]:outline-offset-2 [&.p3]:[--check-color:var(--destructive)] [&.p2]:[--check-color:var(--warning)] [&.p1]:[--check-color:var(--priority-low)] [@media(pointer:_coarse)]:[&::before]:inset-1.5",
        `p${task.priority}`,
        task.completedAt
          ? 'checked [&::before]:border-muted-foreground [&::before]:bg-muted-foreground text-background'
          : '',
      )}
      disabled={task.deleted}
      aria-label={t(task.completedAt ? 'tasks.markIncompleteNamed' : 'tasks.completeNamed', {
        title: task.title,
      })}
      checked={Boolean(task.completedAt)}
      onCheckedChange={() => taskActions.toggle(task.id)}
      onClick={(event) => event.stopPropagation()}
    >
      <CompletionCheckbox.Indicator className="relative grid place-items-center">
        <CompletionCheck size={12} />
      </CompletionCheckbox.Indicator>
    </CompletionCheckbox.Root>
  );
}
