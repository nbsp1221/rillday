import { Button as ButtonPrimitive } from '@base-ui/react/button';
import { Checkbox as CompletionCheckbox } from '@base-ui/react/checkbox';
import { KeyboardSensor, PointerActivationConstraints, PointerSensor } from '@dnd-kit/dom';
import { useDragDropMonitor, useDraggable } from '@dnd-kit/react';
import { defaultRangeExtractor, useVirtualizer } from '@tanstack/react-virtual';
import { cn } from 'cn';
import { Check as CompletionCheck } from 'lucide-react';
import { type CSSProperties, type ReactNode, memo, useCallback, useRef, useState } from 'react';
import { Temporal } from 'temporal-polyfill/implementation';
import invariant from 'tiny-invariant';
import type { Task } from '#application';
import { useWorkspace } from '#entities/workspace';
import { useI18n } from '#shared/i18n';
import { calendarEventLayout } from '../model/calendar-event-layout';
import { CalendarResizeHandles } from './CalendarResizeHandles';

const calendarSensors = [
  PointerSensor.configure({
    activatorElements: (source) => [source.element],
    preventActivation: (event) =>
      event.target instanceof Element &&
      Boolean(event.target.closest('[data-calendar-resize], [data-slot="checkbox"]')),
    activationConstraints: (event) =>
      event.pointerType === 'touch'
        ? [new PointerActivationConstraints.Delay({ value: 250, tolerance: 5 })]
        : [new PointerActivationConstraints.Distance({ value: 4 })],
  }),
  KeyboardSensor.configure({
    preventActivation: (event, source) => event.code !== 'Space' || event.target !== source.handle,
  }),
];

export const CalendarTask = memo(function CalendarTask({
  task,
  timeline = false,
  lane = 0,
  columns = 1,
  color,
}: {
  task: Task;
  timeline?: boolean;
  lane?: number;
  columns?: number;
  color: string;
}) {
  const { t, formatTime } = useI18n();
  const { taskActions, selectTask } = useWorkspace();
  const { ref, handleRef, isDragSource } = useDraggable({
    id: task.id,
    type: 'task',
    data: { taskId: task.id, title: task.title },
    sensors: calendarSensors,
  });
  const time = timeline && task.time ? Temporal.PlainTime.from(task.time) : null;
  const start = time ? time.hour * 60 + time.minute : 0;
  const layout = calendarEventLayout(task.duration, 1440 - start);
  const style: CSSProperties = {
    '--task-color': color,
    ...(timeline
      ? {
          'position': 'absolute',
          'top': `${((time?.minute ?? 0) / 60) * 64}px`,
          'height': `${layout.height}px`,
          '--calendar-event-lines': layout.lines,
          '--calendar-line-height': `${layout.lineHeight}px`,
          'width': `calc(${100 / columns}% - 5px)`,
          'left': `calc(${(lane * 100) / columns}% + 2px)`,
          'zIndex': 4,
        }
      : {}),
  };

  return (
    <div
      ref={ref}
      data-task-id={task.id}
      data-compact={timeline && layout.compact ? '' : undefined}
      title={task.title}
      onClick={(event) => {
        if (
          !(event.target instanceof Element
            ? event.target.closest('button, [role="checkbox"]')
            : null)
        ) {
          selectTask(task.id);
        }
      }}
      className={cn(
        'group select-none touch-none data-[resizing]:z-20 data-[resizing]:ring-1 data-[resizing]:ring-ring [&.timed[data-compact]]:py-0',
        'calendar-task min-w-0 flex gap-[5px] items-start [background:color-mix(in_srgb,_var(--task-color,_var(--primary))_15%,_var(--background))] [border-left:2px_solid_var(--task-color,_var(--primary))] rounded-[3px] py-1 px-[5px] cursor-grab text-xs leading-(--text-xs--line-height) active:cursor-grabbing hover:[background:color-mix(in_srgb,_var(--task-color,_var(--primary))_24%,_var(--background))] [.calendar-undated_&]:mb-[5px] [.calendar-undated_&]:bg-transparent [.calendar-undated_&]:[border-left:0] [.calendar-undated_&]:py-[7px] [.calendar-undated_&]:px-[1px] [@media(max-width:_700px)]:text-xs [@media(max-width:_700px)]:p-[3px] [@media(max-width:_700px)]:leading-(--text-xs--line-height)',
        `priority-${task.priority}`,
        task.completedAt ? 'completed opacity-50' : '',
        timeline ? 'timed mb-[3px] min-h-0 box-border overflow-hidden' : '',
        isDragSource ? 'is-dragging opacity-40' : '',
      )}
      style={style}
    >
      <CompletionCheckbox.Root
        render={<button type="button" />}
        nativeButton
        checked={Boolean(task.completedAt)}
        className="calendar-task-check shrink-0 w-3 h-3 border border-muted-foreground [background:none] rounded-[3px] p-0 mt-0.5 flex items-center justify-center [.calendar-task.priority-3_&]:border-danger-text [.calendar-task.priority-3_&]:text-danger-text [.calendar-task.priority-2_&]:border-warning [.calendar-task.priority-2_&]:text-warning [.calendar-task.priority-1_&]:border-priority-low [.calendar-task.priority-1_&]:text-priority-low [@media(max-width:_700px)]:hidden"
        aria-label={t(task.completedAt ? 'tasks.markIncomplete' : 'common.complete')}
        onCheckedChange={() => taskActions.toggle(task.id)}
      >
        <CompletionCheckbox.Indicator className="relative grid place-items-center">
          <CompletionCheck size={12} />
        </CompletionCheckbox.Indicator>
      </CompletionCheckbox.Root>
      <ButtonPrimitive
        ref={handleRef}
        aria-roledescription={t('tasks.task')}
        onClick={() => selectTask(task.id)}
        className={
          'calendar-task-title cursor-grab active:cursor-grabbing [.calendar-task.completed_&]:line-through [background:none] border-0 p-0 text-left overflow-hidden whitespace-nowrap text-ellipsis min-w-0 flex-1 [touch-action:none] [&_span]:text-xs [&_span]:opacity-75 [&_span]:leading-[inherit] [.calendar-task.timed_&]:whitespace-normal [.calendar-task.timed_&]:line-clamp-(--calendar-event-lines) [.calendar-task.timed_&]:leading-(--calendar-line-height) [@media(max-width:_700px)]:[&_span]:hidden [.calendar-agenda_&]:whitespace-normal'
        }
      >
        {task.time && <span data-calendar-time>{formatTime(task.time)} </span>}
        {task.title}
      </ButtonPrimitive>
      {timeline && task.time && <CalendarResizeHandles task={task} />}{' '}
    </div>
  );
});

export const emptyCalendarTasks: Task[] = [];

type Colors = Map<string, string>;

export const CalendarTaskStack = memo(function CalendarTaskStack({
  tasks,
  pending,
  dated,
  order,
  colors,
  virtualize = false,
}: {
  virtualize?: boolean;
  tasks: Task[];
  pending: Task | null;
  dated: boolean;
  order: Map<string, number>;
  colors: Colors;
}) {
  const { formatTime } = useI18n();
  const incoming = pending && !tasks.some((task) => task.id === pending.id) ? pending : null;
  const items = incoming
    ? [...tasks, incoming].sort((a, b) => {
        const timeOrder = dated ? (a.time || '').localeCompare(b.time || '') : 0;
        if (timeOrder) {
          return timeOrder;
        }
        const left = order.get(a.id);
        const right = order.get(b.id);
        return left !== undefined && right !== undefined ? left - right : 0;
      })
    : tasks;

  const render = (task: Task) =>
    task.id === incoming?.id ? (
      <div
        key={`pending:${task.id}`}
        className="calendar-task flex gap-[5px] items-start [background:color-mix(in_srgb,_var(--task-color,_var(--primary))_15%,_var(--background))] [border-left:2px_solid_var(--task-color,_var(--primary))] py-1 px-[5px] cursor-grab active:cursor-grabbing hover:[background:color-mix(in_srgb,_var(--task-color,_var(--primary))_24%,_var(--background))] [.calendar-undated_&]:mb-[5px] [.calendar-undated_&]:bg-transparent [.calendar-undated_&]:[border-left:0] [.calendar-undated_&]:py-[7px] [.calendar-undated_&]:px-[1px] [@media(max-width:_700px)]:text-xs [@media(max-width:_700px)]:p-[3px] [@media(max-width:_700px)]:leading-(--text-xs--line-height) calendar-drop-preview relative shrink-0 min-w-0 [outline:1px_dashed_var(--link)] outline-offset-[-1px] rounded-sm text-foreground text-xs leading-(--text-xs--line-height) overflow-hidden pointer-events-none select-none [border-left-color:transparent] [background:color-mix(in_srgb,_var(--link)_12%,_var(--background))]"
        aria-hidden="true"
      >
        <span className="calendar-task-check shrink-0 w-3 h-3 border border-muted-foreground [background:none] rounded-[3px] p-0 mt-0.5 flex items-center justify-center [.calendar-task.priority-3_&]:border-danger-text [.calendar-task.priority-3_&]:text-danger-text [.calendar-task.priority-2_&]:border-warning [.calendar-task.priority-2_&]:text-warning [.calendar-task.priority-1_&]:border-priority-low [.calendar-task.priority-1_&]:text-priority-low [@media(max-width:_700px)]:hidden" />
        <span className="calendar-task-title [.calendar-task.completed_&]:line-through [background:none] border-0 p-0 text-left overflow-hidden whitespace-nowrap text-ellipsis min-w-0 flex-1 [touch-action:none] [&_span]:text-xs [&_span]:opacity-75 [&_span]:leading-(--text-xs--line-height) [.calendar-task.timed_&]:whitespace-normal [.calendar-task.timed_&]:leading-[15px] [@media(max-width:_700px)]:[&_span]:hidden [.calendar-agenda_&]:whitespace-normal">
          {task.time && <span>{formatTime(task.time)} </span>}
          {task.title}
        </span>
      </div>
    ) : (
      <CalendarTask key={task.id} task={task} color={colors.get(task.listId) ?? '#7d9cc4'} />
    );

  return virtualize && items.length > 20 ? (
    <VirtualCalendarStack items={items} render={render} />
  ) : (
    <>{items.map(render)}</>
  );
});

export const CalendarTimeTasks = memo(function CalendarTimeTasks({
  tasks,
  hour,
  lanes,
  colors,
}: {
  tasks: Task[];
  hour: number;
  lanes: Map<
    string,
    {
      lane: number;
      columns: number;
    }
  >;
  colors: Colors;
}) {
  return (
    <>
      {tasks
        .filter((task) => task.time && Temporal.PlainTime.from(task.time).hour === hour)
        .map((task) => (
          <CalendarTask
            key={task.id}
            task={task}
            timeline
            lane={lanes.get(task.id)?.lane ?? 0}
            columns={lanes.get(task.id)?.columns ?? 1}
            color={colors.get(task.listId) ?? '#7d9cc4'}
          />
        ))}
    </>
  );
});

function VirtualCalendarStack({
  items,
  render,
}: {
  items: Task[];
  render: (task: Task) => ReactNode;
}) {
  // TanStack Virtual's mutable measurements cannot be memoized by React Compiler.
  'use no memo';
  const rootRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<string>();
  useDragDropMonitor({
    onDragStart(event) {
      setActive(String(event.operation.source?.data.taskId));
    },
    onDragEnd() {
      setActive(undefined);
    },
  });
  const activeIndex = items.findIndex((task) => task.id === active);
  // oxlint-disable-next-line react/incompatible-library -- No React Compiler; TanStack/virtual#1119 tracks compatibility.
  const virtual = useVirtualizer({
    count: items.length,
    getScrollElement: () => rootRef.current?.closest<HTMLElement>('.calendar-day') ?? null,
    estimateSize: () => 24,
    gap: 3,
    overscan: 2,
    getItemKey: useCallback(
      (index) => {
        const task = items[index];
        invariant(task !== undefined, 'Virtualizer index must reference a task');
        return task.id;
      },
      [items],
    ),
    scrollMargin: rootRef.current?.offsetTop ?? 0,
    rangeExtractor: useCallback(
      (range) => {
        const indexes = defaultRangeExtractor(range);

        if (activeIndex >= 0 && !indexes.includes(activeIndex)) {
          indexes.push(activeIndex);
        }

        return indexes.sort((a, b) => a - b);
      },
      [activeIndex],
    ),
  });

  return (
    <div
      ref={rootRef}
      className="calendar-virtual-stack relative w-full shrink-0"
      style={{ height: virtual.getTotalSize() }}
    >
      {virtual.getVirtualItems().map((row) => {
        const task = items[row.index];
        invariant(task !== undefined, 'Virtualizer row must reference a task');
        return (
          <div
            key={row.key}
            data-index={row.index}
            ref={virtual.measureElement}
            className="calendar-virtual-task absolute top-0 left-0 right-0"
            style={{ transform: `translateY(${row.start - virtual.options.scrollMargin}px)` }}
          >
            {render(task)}
          </div>
        );
      })}
    </div>
  );
}
