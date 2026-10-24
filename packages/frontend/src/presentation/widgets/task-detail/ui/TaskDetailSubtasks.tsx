import { Button as ButtonPrimitive } from '@base-ui/react/button';
import { Checkbox as CompletionCheckbox } from '@base-ui/react/checkbox';
import { Input } from '@repo/ui/components/input';
import { cn } from 'cn';
import { ChevronDown, ChevronRight, Check as CompletionCheck, Plus } from 'lucide-react';
import type { Task } from '#application';
import { taskPriorityClasses } from '#entities/task';
import { useWorkspace } from '#entities/workspace';
import { useI18n } from '#shared/i18n';

export function TaskDetailSubtasks({
  task,
  subtasks,
  adding,
  expanded,
  onToggle,
  subInput,
  setSubInput,
  addSubtask,
  beginAdding,
}: {
  task: Task;
  subtasks: Task[];
  adding: 'subtask' | null;
  expanded: boolean;
  onToggle: () => void;
  subInput: string;
  setSubInput: (value: string) => void;
  addSubtask: () => void;
  beginAdding: () => void;
}) {
  const { t, formatDate } = useI18n();
  const { taskActions, selectTask } = useWorkspace();

  return (
    <>
      {(subtasks.length > 0 || adding === 'subtask') && (
        <section className="td-section mt-6 td-subtasks" aria-label={t('tasks.subtasks')}>
          <div className="td-section-label flex items-center gap-2 text-muted-foreground text-xs mb-2 leading-(--text-xs--line-height) [&_span]:text-muted-foreground [&_>_button]:flex [&_>_button]:items-center [&_>_button]:gap-1.5 [&_>_button]:min-h-7 [&_>_button]:p-0 [&_>_button]:text-foreground [&_>_span]:ml-auto [&_>_span]:tabular-nums">
            <ButtonPrimitive
              aria-expanded={expanded}
              aria-controls={`td-subtasks-${task.id}`}
              onClick={onToggle}
            >
              {expanded ? (
                <ChevronDown className="size-3.5 inline-block shrink-0 align-middle" />
              ) : (
                <ChevronRight className="size-3.5 inline-block shrink-0 align-middle" />
              )}
              {t('tasks.subtasks')}
            </ButtonPrimitive>
            <span>
              {subtasks.filter((child) => child.completedAt).length}/{subtasks.length}
            </span>
          </div>
          <div id={`td-subtasks-${task.id}`} hidden={!expanded}>
            {subtasks.map((child) => (
              <div
                className="td-child-row flex items-center gap-2.5 min-h-9 py-0.5 [border-bottom:0]"
                key={child.id}
              >
                <CompletionCheckbox.Root
                  render={<button type="button" />}
                  nativeButton
                  className={cn(
                    "td-complete [--check-color:var(--priority-color,_var(--muted-foreground))] grid place-items-center relative w-7 h-7 shrink-0 border-0 rounded-sm bg-transparent p-0 [&::before]:[content:''] [&::before]:absolute [&::before]:inset-1.5 [&::before]:border [&::before]:border-(--check-color) [&::before]:rounded-full [&::before]:bg-transparent [&:not(.is-checked)::before]:[background:color-mix(in_srgb,_var(--check-color)_7.84%,_transparent)] active:bg-transparent hover:bg-transparent [&:not(.is-checked,_:disabled):hover::before]:[background:color-mix(in_srgb,_var(--check-color)_16%,_transparent)] [.task-detail_&:focus-visible]:outline-none [&:focus-visible::before]:[outline:2px_solid_var(--ring)] [&:focus-visible::before]:outline-offset-2 [&_[data-slot='checkbox-indicator']]:text-primary-foreground",
                    child.completedAt
                      ? 'is-checked [&::before]:border-link [&::before]:bg-primary'
                      : '',
                    taskPriorityClasses[child.priority],
                  )}
                  aria-label={t('tasks.namedAction', {
                    title: child.title,
                    action: child.completedAt ? t('tasks.markIncomplete') : t('common.complete'),
                  })}
                  checked={Boolean(child.completedAt)}
                  disabled={task.deleted}
                  onCheckedChange={() => taskActions.toggle(child.id)}
                >
                  <CompletionCheckbox.Indicator className="relative grid place-items-center">
                    <CompletionCheck size={12} />
                  </CompletionCheckbox.Indicator>
                </CompletionCheckbox.Root>
                <ButtonPrimitive
                  onClick={() => selectTask(child.id)}
                  className={cn(
                    'td-child-title flex items-start gap-2 flex-1 min-w-0 text-left bg-transparent border-0 text-foreground py-2 px-0 text-sm leading-(--text-sm--line-height) [&_>_span]:flex-1 [&_>_span]:overflow-hidden [&_>_span]:text-ellipsis [&_>_span]:wrap-anywhere [&_small]:text-xs [&_small]:text-muted-foreground [&_small]:leading-(--text-xs--line-height) [&_small]:shrink-0 [&_small]:whitespace-nowrap [&_svg]:text-muted-foreground [&_svg]:shrink-0 [&_svg]:opacity-0 [&_>_svg]:mt-[3px] [&:hover_>_svg]:opacity-100 [&:focus-visible_>_svg]:opacity-100 [&:hover_>_span]:text-link [@media(pointer:_coarse)]:[&_>_svg]:opacity-100',
                    child.completedAt
                      ? 'is-completed [&_>_span]:line-through [&_>_span]:text-muted-foreground'
                      : '',
                  )}
                >
                  <span>{child.title}</span>
                  {child.date && <small>{formatDate(child.date)}</small>}
                  <ChevronRight className="size-3.5 inline-block shrink-0 align-middle" />
                </ButtonPrimitive>
              </div>
            ))}
            {adding === 'subtask' && (
              <form
                className="td-add-row flex items-center gap-2.5 min-h-9 py-0.5 [border-bottom:0] [&_input]:flex-1 [&_input]:min-w-0 [&_input]:border-0 [&_input]:[outline:0] [&_input]:bg-transparent [&_input]:py-1.5 [&_input]:px-0 [&_input]:text-foreground [&_input]:text-sm [&_input]:leading-(--text-sm--line-height) text-muted-foreground [&_input::placeholder]:text-muted-foreground"
                onSubmit={(event) => {
                  event.preventDefault();
                  addSubtask();
                }}
              >
                <span className="td-add-icon grid place-items-center w-7 h-7 shrink-0">
                  <Plus className="size-3.5 inline-block shrink-0 align-middle" />
                </span>
                <Input
                  autoFocus
                  aria-label={t('tasks.newSubtask')}
                  placeholder={t('tasks.addSubtask')}
                  value={subInput}
                  onChange={(event) => setSubInput(event.target.value)}
                  className={
                    'h-auto min-h-0 rounded-none border-0 bg-transparent p-0 shadow-none text-sm focus-visible:ring-0'
                  }
                />
                <ButtonPrimitive
                  type="submit"
                  aria-label={t('tasks.addSubtask')}
                  className={
                    'td-icon-button inline-flex items-center justify-center w-8 h-8 shrink-0 border-0 rounded-sm bg-transparent text-muted-foreground p-0 hover:bg-surface-hover hover:text-foreground'
                  }
                >
                  <Plus className="size-3.5 inline-block shrink-0 align-middle" />
                </ButtonPrimitive>
              </form>
            )}
          </div>
        </section>
      )}
      {!task.deleted && adding !== 'subtask' && (
        <div className="td-add-actions mt-5 w-[max-content] max-w-full">
          <ButtonPrimitive
            onClick={beginAdding}
            className={
              'td-add-trigger flex items-center gap-1.5 min-h-8 py-1 px-0 bg-transparent text-muted-foreground hover:text-link'
            }
          >
            <Plus className="size-3.5 inline-block shrink-0 align-middle" />
            {t('tasks.addSubtask')}
          </ButtonPrimitive>
        </div>
      )}
    </>
  );
}
