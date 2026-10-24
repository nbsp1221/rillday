import { Button as ButtonPrimitive } from '@base-ui/react/button';
import { Checkbox as CompletionCheckbox } from '@base-ui/react/checkbox';
import { Textarea } from '@repo/ui/components/textarea';
import { cn } from 'cn';
import { ArrowLeft, Check as CompletionCheck, RotateCcw } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { workspaceLabelColor } from '#application';
import { TaskMetadataToken, taskPriorityClasses } from '#entities/task';
import { useWorkspace } from '#entities/workspace';
import { useI18n } from '#shared/i18n';
import { useTaskDetailLayout } from '../model/use-task-detail-layout';
import type { NotesEditor } from './MarkdownNotes';
import type { TaskDetailPopover, TaskDetailPopoverControls } from './TaskDetailMenu';
import { TaskDetailDeleteConfirmation, TaskDetailHeader } from './TaskDetailHeader';
import { TaskDetailMetadata } from './TaskDetailMetadata';
import { TaskDetailNotes } from './TaskDetailNotes';
import { TaskDetailSubtasks } from './TaskDetailSubtasks';

export function TaskDetail() {
  const { t } = useI18n();
  const { data, selectedTaskId, selectTask, taskActions } = useWorkspace();
  const task = data.tasks.find((item) => item.id === selectedTaskId);
  const [popover, setPopover] = useState<TaskDetailPopover>(null);
  const [titleDraft, setTitleDraft] = useState({
    id: task?.id,
    source: task?.title,
    value: task?.title ?? '',
  });
  const title =
    titleDraft.id === task?.id && titleDraft.source === task?.title
      ? titleDraft.value
      : (task?.title ?? '');

  const setTitle = (value: string) => setTitleDraft({ id: task?.id, source: task?.title, value });

  const [subInput, setSubInput] = useState('');
  const [tagInput, setTagInput] = useState('');
  const [sections, setSections] = useState({ subtasks: true });
  const [adding, setAdding] = useState<'subtask' | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const panelRef = useRef<HTMLElement>(null);
  const activePopoverRef = useRef<HTMLDivElement>(null);
  const notesInputRef = useRef<NotesEditor>(null);
  const notesFocusQueuedRef = useRef(false);
  const notesReady = useCallback(() => {
    if (notesFocusQueuedRef.current) {
      notesInputRef.current?.focus();
      notesFocusQueuedRef.current = false;
    }
  }, []);
  const popoverTriggerRef = useRef<HTMLButtonElement | null>(null);
  const titleComposingRef = useRef(false);
  const [previousTaskId, setPreviousTaskId] = useState(selectedTaskId);
  useLayoutEffect(() => {
    notesFocusQueuedRef.current = false;
  }, [selectedTaskId]);
  useTaskDetailLayout({
    selectionId: selectedTaskId,
    panelRef,
  });

  if (previousTaskId !== selectedTaskId) {
    setPreviousTaskId(selectedTaskId);
    setSections({ subtasks: true });
    setPopover(null);
    setSubInput('');
    setTagInput('');
    setAdding(null);
    setConfirmDelete(false);
  }

  const closePopover = () => {
    setPopover(null);
    setConfirmDelete(false);
  };

  useEffect(() => {
    if (!selectedTaskId) {
      return;
    }

    const escape = (event: globalThis.KeyboardEvent) => {
      if (event.defaultPrevented || event.key !== 'Escape' || event.isComposing) {
        return;
      }

      const target = event.target as HTMLElement;

      if (
        !panelRef.current?.contains(target) &&
        !activePopoverRef.current?.contains(target) &&
        target.closest('input,textarea,select,[contenteditable="true"],[role="menu"]')
      ) {
        return;
      }

      if (titleComposingRef.current || event.keyCode === 229) {
        return;
      }

      event.preventDefault();
      event.stopPropagation();

      if (popover) {
        closePopover();
      } else if (adding) {
        setAdding(null);
        setSubInput('');
      } else {
        selectTask(null);
      }
    };

    window.addEventListener('keydown', escape);

    return () => window.removeEventListener('keydown', escape);
  }, [selectedTaskId, popover, adding, selectTask]);

  if (!task) {
    return null;
  }

  const parent = data.tasks.find((item) => item.id === task.parentId);
  const children = data.tasks
    .filter((item) => item.parentId === task.id && !item.deleted)
    .sort((a, b) => a.order - b.order);

  const beginAdding = () => {
    setPopover(null);
    setAdding('subtask');
    setSections({ subtasks: true });
    requestAnimationFrame(() =>
      panelRef.current?.querySelector<HTMLInputElement>('.td-subtasks .td-add-row input')?.focus(),
    );
  };

  const open = (value: TaskDetailPopover, trigger: HTMLButtonElement) => {
    popoverTriggerRef.current = trigger;

    if (popover === value) {
      closePopover();
    } else {
      setPopover(value);
      setConfirmDelete(false);
    }
  };

  const addSubtask = () => {
    if (!subInput.trim()) {
      return;
    }

    const created = taskActions.createSubtask(task.id, subInput);

    if (created.status === 'applied') {
      setSubInput('');
    }
  };

  const restoreTask = () => {
    const result = taskActions.restore(task.id);

    if (result.status === 'applied' && popover) {
      closePopover();
    }
  };

  const popovers: TaskDetailPopoverControls = {
    active: popover,
    setActive: setPopover,
    triggerRef: popoverTriggerRef,
    contentRef: activePopoverRef,
    close: closePopover,
    open,
  };

  return (
    <>
      <aside
        className="task-detail [--detail-inset:calc(var(--spacing)_*_5)] flex flex-col min-w-0 h-full min-h-0 m-0 w-auto bg-surface-inset text-foreground border border-separator rounded-lg overflow-hidden flex-1 py-(--detail-inset) text-sm relative leading-(--text-sm--line-height) [&_button]:cursor-pointer [&_button:disabled]:cursor-default [&_button:disabled]:opacity-45 [&_button:focus-visible]:[outline:2px_solid_var(--primary)] [&_button:focus-visible]:outline-offset-2 [@media(max-width:_650px)]:min-w-0 [@media(max-width:_650px)]:m-0 [@media(max-width:_650px)]:h-full"
        ref={panelRef}
        aria-label={t('tasks.details')}
      >
        <TaskDetailHeader
          task={task}
          popovers={popovers}
          restoreTask={restoreTask}
          onDeleteRequest={() => setConfirmDelete(true)}
        />
        {task.deleted && (
          <div className="td-trash-banner flex items-center justify-between gap-2 bg-danger-surface py-[11px] px-5 text-danger-text text-sm leading-(--text-sm--line-height) [&_button]:flex [&_button]:items-center [&_button]:gap-[5px] [&_button]:text-danger-text [&_button]:border-0 [&_button]:bg-transparent [&_button]:p-0">
            <span>{t('tasks.trashed')}</span>
            <ButtonPrimitive onClick={restoreTask}>
              <RotateCcw className="size-3.5 inline-block shrink-0 align-middle" />
              {t('common.restore')}
            </ButtonPrimitive>
          </div>
        )}
        <div className="td-body flex-1 min-h-0 overflow-auto [&::-webkit-scrollbar]:size-[7px] [&::-webkit-scrollbar-thumb]:rounded-lg [&::-webkit-scrollbar-thumb]:bg-scrollbar [&::-webkit-scrollbar-thumb:hover]:bg-scrollbar-hover py-0 px-(--detail-inset)">
          {parent && (
            <ButtonPrimitive
              aria-label={t('tasks.backToParent')}
              onClick={() => selectTask(parent.id)}
              className={
                'td-parent flex items-center gap-1 max-w-full p-0 [margin:0_0_13px] border-0 bg-transparent text-muted-foreground text-sm leading-(--text-sm--line-height) [&_span]:overflow-hidden [&_span]:text-ellipsis [&_span]:whitespace-nowrap [&_span]:min-w-0 hover:text-link focus-visible:text-link'
              }
            >
              <ArrowLeft className="size-3.5 inline-block shrink-0 align-middle" />
              <span>{parent.title}</span>
            </ButtonPrimitive>
          )}
          <TaskDetailMetadata
            task={task}
            popovers={popovers}
            tagInput={tagInput}
            setTagInput={setTagInput}
          />
          <div className="td-title-row flex items-start gap-2 -ml-1.5">
            <CompletionCheckbox.Root
              render={<button type="button" />}
              nativeButton
              className={cn(
                "td-complete [--check-color:var(--priority-color,_var(--muted-foreground))] grid place-items-center relative w-7 h-7 shrink-0 border-0 rounded-sm bg-transparent p-0 [&::before]:[content:''] [&::before]:absolute [&::before]:inset-1.5 [&::before]:border [&::before]:border-(--check-color) [&::before]:rounded-full [&::before]:bg-transparent [&:not(.is-checked)::before]:[background:color-mix(in_srgb,_var(--check-color)_7.84%,_transparent)] active:bg-transparent hover:bg-transparent [&:not(.is-checked,_:disabled):hover::before]:[background:color-mix(in_srgb,_var(--check-color)_16%,_transparent)] [.task-detail_&:focus-visible]:outline-none [&:focus-visible::before]:[outline:2px_solid_var(--ring)] [&:focus-visible::before]:outline-offset-2 [&_[data-slot='checkbox-indicator']]:text-primary-foreground",
                task.completedAt ? 'is-checked [&::before]:border-link [&::before]:bg-primary' : '',
                taskPriorityClasses[task.priority],
              )}
              aria-label={task.completedAt ? t('tasks.markTaskIncomplete') : t('tasks.complete')}
              checked={Boolean(task.completedAt)}
              disabled={task.deleted}
              onCheckedChange={() => taskActions.toggle(task.id)}
            >
              <CompletionCheckbox.Indicator className="relative grid place-items-center">
                <CompletionCheck size={12} />
              </CompletionCheckbox.Indicator>
            </CompletionCheckbox.Root>{' '}
            <Textarea
              aria-label={t('tasks.titleLabel')}
              rows={1}
              value={title}
              readOnly={task.deleted}
              placeholder={t('tasks.titleLabel')}
              onCompositionStart={() => {
                titleComposingRef.current = true;
              }}
              onCompositionEnd={(event) => {
                titleComposingRef.current = false;
                const value = event.currentTarget.value;
                setTitle(value);

                if (value.trim()) {
                  taskActions.update(task.id, { title: value });
                }
              }}
              onChange={(event) => {
                setTitle(event.target.value);

                if (!titleComposingRef.current && event.target.value.trim()) {
                  taskActions.update(task.id, { title: event.target.value });
                }
              }}
              onKeyDown={(event) => {
                if (
                  event.key === 'Enter' &&
                  !event.shiftKey &&
                  !event.nativeEvent.isComposing &&
                  event.keyCode !== 229 &&
                  !titleComposingRef.current
                ) {
                  event.preventDefault();

                  if (notesInputRef.current) {
                    notesInputRef.current.focus();
                  } else {
                    notesFocusQueuedRef.current = true;
                  }
                }
              }}
              onBlur={(event) => {
                titleComposingRef.current = false;
                const value = event.currentTarget.value.trim();

                if (value) {
                  setTitle(value);
                  taskActions.update(task.id, { title: value });
                } else {
                  setTitle(task.title);
                }
              }}
              className={cn(
                'min-h-0 rounded-none border-0 bg-transparent p-0 shadow-none focus-visible:ring-0',
                'td-title [.td-title-row_&]:pt-0.5 block w-full min-h-[29px] resize-none overflow-hidden border-0 p-0 bg-transparent dark:bg-transparent outline-none text-foreground text-base md:text-base font-semibold leading-(--text-base--line-height) [letter-spacing:-0.35px] [.task-detail_&]:rounded-none [.task-detail_&]:[caret-color:var(--foreground)] [.task-detail_&:focus]:border-0 [.task-detail_&:focus]:outline-none [.task-detail_&:focus]:shadow-[none] [@media(max-width:_650px)]:text-base [@media(max-width:_650px)]:leading-(--text-base--line-height)',
                task.completedAt ? 'is-completed text-muted-foreground' : '',
              )}
            />
          </div>
          <div className="td-tag-chips flex flex-wrap gap-2 [margin:8px_0_0_30px] [&:empty]:hidden">
            {task.tags.map((tag) => (
              <TaskMetadataToken key={tag} name={tag} color={workspaceLabelColor(data, tag)} />
            ))}
          </div>
          <TaskDetailNotes task={task} editorRef={notesInputRef} onReady={notesReady} />
          <TaskDetailSubtasks
            task={task}
            subtasks={children}
            adding={adding}
            expanded={sections.subtasks}
            onToggle={() => setSections((value) => ({ ...value, subtasks: !value.subtasks }))}
            subInput={subInput}
            setSubInput={setSubInput}
            addSubtask={addSubtask}
            beginAdding={beginAdding}
          />
        </div>
      </aside>
      {confirmDelete && (
        <TaskDetailDeleteConfirmation taskId={task.id} close={() => setConfirmDelete(false)} />
      )}
    </>
  );
}
