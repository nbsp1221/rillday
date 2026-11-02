import { Button as ButtonPrimitive } from '@base-ui/react/button';
import { Popover } from '@base-ui/react/popover';
import { DropdownMenuRadioGroup, DropdownMenuRadioItem } from '@repo/ui/components/dropdown-menu';
import { Input } from '@repo/ui/components/input';
import { cn } from 'cn';
import { CalendarDays, Check, Flag, Plus, Repeat2, Tag } from 'lucide-react';
import { useId, useMemo } from 'react';
import { type Task, workspaceLabelColor, workspaceLabels } from '#application';
import {
  DatePickerPanel,
  taskPriorities as priorities,
  taskDateTone,
  taskPriorityClasses,
} from '#entities/task';
import { useWorkspace } from '#entities/workspace';
import { useI18n } from '#shared/i18n';
import { WorkspacePopover } from '#shared/ui/WorkspacePopover';
import { TaskDetailMenu, type TaskDetailPopoverControls } from './TaskDetailMenu';

export function TaskDetailMetadata({
  task,
  popovers,
  tagInput,
  setTagInput,
}: {
  task: Task;
  popovers: TaskDetailPopoverControls;
  tagInput: string;
  setTagInput: (value: string) => void;
}) {
  const { active, setActive, triggerRef, contentRef, close, open } = popovers;
  const { t, formatDate, formatTime } = useI18n();
  const controlId = useId();
  const dateHandle = useMemo(() => Popover.createHandle(), []);
  const tagHandle = useMemo(() => Popover.createHandle(), []);
  const { data, taskActions } = useWorkspace();
  const dateTone = taskDateTone(task);
  const tagQuery = tagInput.replace(/^#/, '').toLocaleLowerCase();
  const matchingTags = workspaceLabels(data).filter((tag) =>
    tag.toLocaleLowerCase().includes(tagQuery),
  );

  const setDate = (value: string | null) => taskActions.setDate(task.id, value);

  const addTags = () => {
    const values = tagInput
      .split(/[\s,#]+/)
      .map((value) => value.trim())
      .filter(Boolean);

    if (!values.length) {
      return;
    }

    const result = taskActions.update(task.id, { tags: [...new Set([...task.tags, ...values])] });

    if (result.status !== 'failed') {
      setTagInput('');
    }
  };

  const datePopover = active === 'date' && (
    <DatePickerPanel
      handle={dateHandle}
      triggerId={`${controlId}-date`}
      sourceZone={task.zone}
      panelRef={contentRef}
      anchorRef={triggerRef}
      className="td-date-panel"
      label={t('dates.taskSettings')}
      calendarLabel={t('dates.taskDate')}
      value={task.date}
      onChange={setDate}
      time={task.time}
      onTimeChange={(time) => taskActions.setTime(task.id, time)}
      duration={task.duration}
      onDurationChange={(duration) => taskActions.update(task.id, { duration })}
      repeat={task.repeat}
      onRepeatChange={(repeat) => taskActions.setRepeat(task.id, repeat)}
      close={() => setActive((current) => (current === 'date' ? null : current))}
    />
  );

  return (
    <div className="td-metadata flex items-center gap-1 [margin:0_0_16px_-8px]">
      <div className="td-anchor relative flex items-center td-date-anchor min-w-0">
        <Popover.Trigger
          handle={dateHandle}
          id={`${controlId}-date`}
          data-detail-trigger
          aria-haspopup="dialog"
          data-date-tone={dateTone}
          aria-description={dateTone === 'overdue' ? t('tasks.overdue') : undefined}
          aria-label={
            task.date
              ? `${formatDate(task.date)}${task.time ? ` ${formatTime(task.time)}` : ''}`
              : t('tasks.setDate')
          }
          title={
            task.date
              ? t('dates.setDateTime', {
                  date: task.date,
                  time: task.time ? ` ${formatTime(task.time)}` : '',
                })
              : t('tasks.setDate')
          }
          aria-expanded={active === 'date'}
          onClick={(event) => open('date', event.currentTarget)}
          disabled={task.deleted}
          className={cn(
            "td-icon-button inline-flex items-center justify-center w-8 h-8 shrink-0 border-0 rounded-sm bg-transparent text-muted-foreground p-0 hover:bg-surface-hover hover:text-foreground td-date-button flex gap-[7px] text-xs whitespace-nowrap max-w-full leading-(--text-xs--line-height) [&_>_span]:overflow-hidden [&_>_span]:text-ellipsis [&_>_svg]:shrink-0 [.task-detail_&:disabled]:opacity-100 task-date [--date-today:var(--link)] [--date-overdue:var(--danger-text)] [--date-neutral:color-mix(in_srgb,_var(--muted-foreground)_90%,_var(--foreground))] [--date-color:var(--date-neutral)] [&[data-date-tone='today']]:[--date-color:var(--date-today)] [&[data-date-tone='overdue']]:[--date-color:var(--date-overdue)] [.task-detail_&]:text-date-color",
            task.date ? 'has-date w-auto min-w-8 px-2' : '',
          )}
        >
          <CalendarDays className="size-4 inline-block shrink-0 align-middle" />
          {task.date && (
            <span>
              {formatDate(task.date)}
              {task.time ? ` ${formatTime(task.time)}` : ''}
            </span>
          )}
          {task.repeat && <Repeat2 className="size-3.5 inline-block shrink-0 align-middle" />}
        </Popover.Trigger>
        {datePopover}
      </div>
      <div className="td-anchor relative flex items-center">
        <TaskDetailMenu
          popovers={popovers}
          kind={'priority'}
          label={t('tasks.priority')}
          trigger={
            <ButtonPrimitive
              data-detail-trigger
              aria-haspopup="menu"
              title={t(`priority.${task.priority}`, { ns: 'labels' })}
              aria-label={t('tasks.setPriority')}
              aria-expanded={active === 'priority'}
              disabled={task.deleted}
              className={cn(
                'td-icon-button inline-flex items-center justify-center w-8 h-8 shrink-0 border-0 rounded-sm bg-transparent text-muted-foreground p-0 hover:bg-surface-hover td-priority-control text-priority-color',
                taskPriorityClasses[task.priority],
              )}
            >
              <Flag
                fill={task.priority ? 'currentColor' : 'none'}
                className="size-4 inline-block shrink-0 align-middle"
              />
            </ButtonPrimitive>
          }
        >
          <DropdownMenuRadioGroup value={String(task.priority)}>
            {priorities.map((priority) => (
              <DropdownMenuRadioItem
                value={String(priority)}
                className={cn(
                  'workspace-option',
                  'td-menu-item flex items-center gap-2 w-full min-h-8 py-1.5 px-2 bg-transparent border-0 rounded-sm text-left text-sm text-inherit leading-(--text-sm--line-height) [&_span]:flex-1 [&_span]:min-w-0 [&_span]:overflow-hidden [&_span]:text-ellipsis [&_span]:whitespace-nowrap td-priority-control text-priority-color',
                  taskPriorityClasses[priority],
                )}
                key={priority}
                onClick={() => {
                  taskActions.update(task.id, { priority });
                  close();
                }}
              >
                <Flag
                  fill={priority ? 'currentColor' : 'none'}
                  className="size-3.5 inline-block shrink-0 align-middle"
                />
                <span>{t(`priority.${priority}`, { ns: 'labels' })}</span>
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </TaskDetailMenu>
      </div>
      <div className="td-anchor relative flex items-center">
        <Popover.Trigger
          handle={tagHandle}
          id={`${controlId}-tags`}
          data-detail-trigger
          aria-haspopup="dialog"
          title={t('labels.add')}
          aria-label={t('labels.add')}
          aria-expanded={active === 'tags'}
          disabled={task.deleted}
          onClick={(event) => open('tags', event.currentTarget)}
          className={
            'td-icon-button inline-flex items-center justify-center w-8 h-8 shrink-0 border-0 rounded-sm bg-transparent text-muted-foreground p-0 hover:bg-surface-hover hover:text-foreground'
          }
        >
          <Tag className="size-4 inline-block shrink-0 align-middle" />
        </Popover.Trigger>
        {active === 'tags' && (
          <WorkspacePopover
            handle={tagHandle}
            triggerId={`${controlId}-tags`}
            anchor={triggerRef}
            onClose={() => setActive((current) => (current === 'tags' ? null : current))}
            className="td-popover min-w-47.5 [font-family:var(--font-sans)] text-sm leading-(--text-sm--line-height) [&_select]:[font-family:inherit] [&_input]:[font-family:inherit] [&_button]:[font-family:inherit] [&_button:focus-visible]:[outline:2px_solid_var(--ring)] [&_button:focus-visible]:-outline-offset-2 td-tags-popover w-64 p-3"
            ref={contentRef}
            role="dialog"
            aria-label={t('labels.edit')}
          >
            <form
              onSubmit={(event) => {
                event.preventDefault();
                addTags();
              }}
              className="td-tag-form flex gap-1 items-center [border-bottom:1px_solid_var(--separator)] [margin:0_0_8px] [&_input]:flex-1 [&_input]:min-w-0 [&_input]:bg-transparent [&_input]:border-0 [&_input]:text-foreground [&_input]:p-2 [&_input]:text-sm [&_input]:[outline:0] [&_input]:leading-(--text-sm--line-height)"
            >
              <Input
                autoFocus
                aria-label={t('labels.toAdd')}
                placeholder={t('labels.entryPlaceholder')}
                value={tagInput}
                onChange={(event) => setTagInput(event.target.value)}
                className={
                  'h-auto min-h-0 rounded-none border-0 bg-transparent p-0 shadow-none text-sm focus-visible:ring-0'
                }
              />
              <ButtonPrimitive
                type="submit"
                aria-label={t('labels.addEntered')}
                className={
                  'td-icon-button inline-flex items-center justify-center w-8 h-8 shrink-0 border-0 rounded-sm bg-transparent text-muted-foreground p-0 hover:bg-surface-hover hover:text-foreground'
                }
              >
                <Plus className="size-3.5 inline-block shrink-0 align-middle" />
              </ButtonPrimitive>
            </form>
            {matchingTags.map((tag) => (
              <ButtonPrimitive
                key={tag}
                aria-pressed={task.tags.includes(tag)}
                onClick={() =>
                  taskActions.update(task.id, {
                    tags: task.tags.includes(tag)
                      ? task.tags.filter((value) => value !== tag)
                      : [...task.tags, tag],
                  })
                }
                className={cn(
                  'workspace-option',
                  'td-menu-item flex items-center gap-2 w-full min-h-8 py-1.5 px-2 bg-transparent border-0 rounded-sm text-left text-sm text-inherit leading-(--text-sm--line-height) [&_span]:flex-1 [&_span]:min-w-0 [&_span]:overflow-hidden [&_span]:text-ellipsis [&_span]:whitespace-nowrap',
                )}
              >
                <Tag
                  style={{ color: workspaceLabelColor(data, tag) }}
                  className="size-3.5 inline-block shrink-0 align-middle"
                />
                <span>{tag}</span>
                {task.tags.includes(tag) && (
                  <Check className="size-3.5 inline-block shrink-0 align-middle" />
                )}
              </ButtonPrimitive>
            ))}
            {!matchingTags.length && (
              <p className="td-small-hint text-xs text-muted-foreground leading-(--text-xs--line-height) py-1 px-2 my-1 mx-0">
                {t('labels.multipleHint')}
              </p>
            )}
            <Popover.Close className="sr-only">{t('common.closePicker')}</Popover.Close>
          </WorkspacePopover>
        )}
      </div>
    </div>
  );
}
