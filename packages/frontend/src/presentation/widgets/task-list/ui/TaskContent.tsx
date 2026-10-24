import { Button as ButtonPrimitive } from '@base-ui/react/button';
import { cn } from 'cn';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { type ReactNode, useId } from 'react';
import type { Task } from '#application';
import { type ReorderTask, TaskReorder } from './TaskReorder';
import { TaskRow } from './TaskRow';

export function TaskContent({ children }: { children: ReactNode }) {
  return (
    <div className="task-scroll min-h-0 flex-1 overflow-auto [&::-webkit-scrollbar]:size-[7px] [&::-webkit-scrollbar-thumb]:rounded-lg [&::-webkit-scrollbar-thumb]:bg-scrollbar [&::-webkit-scrollbar-thumb:hover]:bg-scrollbar-hover [scrollbar-gutter:stable_both-edges] p-(--task-content-inset) pe-(--task-content-end-inset) [@supports(selector(::-webkit-scrollbar))]:ps-[calc(var(--task-content-inset)_-_var(--scrollbar-size))] [@supports(selector(::-webkit-scrollbar))]:pe-[calc(var(--task-content-end-inset)_-_var(--scrollbar-size))] [@media(min-width:_900px)]:[.workspace-body:has(>_[data-panel]:not([hidden])_.detail-pane)_&]:[scrollbar-width:none] [@media(min-width:_900px)]:[.workspace-body:has(>_[data-panel]:not([hidden])_.detail-pane)_&]:ps-(--task-content-inset) [@media(min-width:_900px)]:[.workspace-body:has(>_[data-panel]:not([hidden])_.detail-pane)_&]:pe-(--task-content-end-inset) [@media(min-width:_900px)]:[.workspace-body:has(>_[data-panel]:not([hidden])_.detail-pane)_&::-webkit-scrollbar]:hidden">
      <div className="task-content-stack flex flex-col gap-4 min-w-0">{children}</div>
    </div>
  );
}

export function TaskSection({
  title,
  count,
  expanded,
  onToggle,
  overdue = false,
  children,
}: {
  title: string;
  count: number;
  expanded: boolean;
  onToggle: () => void;
  overdue?: boolean;
  children: ReactNode;
}) {
  const panelId = useId();

  return (
    <section className={cn('task-section min-w-0', overdue ? ' is-overdue' : '')}>
      <h2 className="task-section-heading m-0 text-sm leading-(--text-sm--line-height) font-medium">
        <ButtonPrimitive
          aria-expanded={expanded}
          aria-controls={panelId}
          onClick={onToggle}
          className={
            'task-section-toggle flex items-center gap-2 w-full min-h-8 p-1 text-left rounded-sm text-muted-foreground hover:bg-surface-hover hover:text-foreground'
          }
        >
          {expanded ? (
            <ChevronDown className="size-4 inline-block shrink-0 align-middle" />
          ) : (
            <ChevronRight className="size-4 inline-block shrink-0 align-middle" />
          )}
          <span className="task-section-title min-w-0 wrap-anywhere [.task-section.is-overdue_&]:text-danger-text">
            {title}
          </span>{' '}
          <span className="task-section-count shrink-0 text-muted-foreground text-xs leading-(--text-xs--line-height) font-normal tabular-nums">
            {count}
          </span>
        </ButtonPrimitive>
      </h2>
      <div id={panelId} className="task-section-body [&:not([hidden])]:pt-1" hidden={!expanded}>
        {expanded && children}
      </div>
    </section>
  );
}

export function TaskItems({
  tasks,
  showList,
  reorder,
  compact = false,
  showChildren = true,
}: {
  tasks: Task[];
  showList: boolean;
  reorder?: ReorderTask;
  compact?: boolean;
  showChildren?: boolean;
}) {
  if (reorder) {
    return (
      <TaskReorder tasks={tasks} move={reorder}>
        {(state) =>
          tasks.map((task) => (
            <TaskRow
              key={task.id}
              task={task}
              showList={showList}
              reorder={state}
              compact={compact}
              showChildren={showChildren}
            />
          ))
        }
      </TaskReorder>
    );
  }

  return (
    <div className="task-items flex flex-col gap-0.5 min-w-0">
      {tasks.map((task) => (
        <TaskRow
          key={task.id}
          task={task}
          showList={showList}
          compact={compact}
          showChildren={showChildren}
        />
      ))}
    </div>
  );
}
