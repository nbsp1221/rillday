import { Textarea } from '@repo/ui/components/textarea';
import { type RefObject, Suspense, lazy } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import type { Task } from '#application';
import { useWorkspace } from '#entities/workspace';
import { useI18n } from '#shared/i18n';
import type { NotesEditor } from './MarkdownNotes';

const MarkdownNotes = lazy(() =>
  import('./MarkdownNotes').then((module) => ({ default: module.MarkdownNotes })),
);

export function TaskDetailNotes({
  task,
  editorRef,
  onReady,
}: {
  task: Task;
  editorRef: RefObject<NotesEditor | null>;
  onReady: () => void;
}) {
  const { t } = useI18n();
  const { taskActions } = useWorkspace();

  return (
    <ErrorBoundary
      fallback={
        <div className="td-notes block w-full min-h-6 resize-none overflow-hidden border-0 bg-transparent text-foreground p-0 mt-5 outline-none text-sm [&::placeholder]:text-muted-foreground [&:focus::placeholder]:text-muted-foreground [&:placeholder-shown:focus]:min-h-16 [.task-detail_&]:rounded-none [.task-detail_&]:[caret-color:var(--foreground)] [.task-detail_&:focus]:border-0 [.task-detail_&:focus]:outline-none [.task-detail_&:focus]:shadow-[none] [.td-markdown_&]:min-h-6 [.td-markdown_&]:m-0 [.td-markdown_&]:p-0 [.td-markdown_&]:outline-none [.td-markdown_&]:whitespace-pre-wrap [.td-markdown_&]:wrap-anywhere [.td-markdown_&]:overflow-visible [.td-markdown_&[contenteditable='true']:empty:focus]:min-h-16 [.td-markdown_&[aria-hidden='true']]:absolute [.td-markdown_&[aria-hidden='true']]:inset-0 [.td-markdown_&[aria-hidden='true']]:pointer-events-none [.td-markdown_&[aria-hidden='true']]:text-muted-foreground [.td-markdown_&_>_:first-child]:mt-0 [.td-markdown_&_>_:last-child]:mb-0">
          <p className="muted [.modal-body_>_&]:m-0 [.modal-body_>_&]:text-sm [.modal-body_>_&]:leading-(--text-sm--line-height) [.modal-body_>_&]:text-muted-foreground text-muted-foreground">
            {t('editor.loadFailed')}
          </p>
          <Textarea
            className="border-0 bg-transparent dark:bg-transparent p-0 text-sm shadow-none focus-visible:ring-0"
            aria-label={t('tasks.description')}
            value={task.notes}
            readOnly={task.deleted}
            onChange={(event) => taskActions.update(task.id, { notes: event.target.value })}
          />
        </div>
      }
    >
      <Suspense
        fallback={
          <div
            className="td-notes block w-full min-h-6 resize-none overflow-hidden border-0 bg-transparent text-foreground p-0 mt-5 outline-none text-sm [&::placeholder]:text-muted-foreground [&:focus::placeholder]:text-muted-foreground [&:placeholder-shown:focus]:min-h-16 [.task-detail_&]:rounded-none [.task-detail_&]:[caret-color:var(--foreground)] [.task-detail_&:focus]:border-0 [.task-detail_&:focus]:outline-none [.task-detail_&:focus]:shadow-[none] [.td-markdown_&]:min-h-6 [.td-markdown_&]:m-0 [.td-markdown_&]:p-0 [.td-markdown_&]:outline-none [.td-markdown_&]:whitespace-pre-wrap [.td-markdown_&]:wrap-anywhere [.td-markdown_&]:overflow-visible [.td-markdown_&[contenteditable='true']:empty:focus]:min-h-16 [.td-markdown_&[aria-hidden='true']]:absolute [.td-markdown_&[aria-hidden='true']]:inset-0 [.td-markdown_&[aria-hidden='true']]:pointer-events-none [.td-markdown_&[aria-hidden='true']]:text-muted-foreground [.td-markdown_&_>_:first-child]:mt-0 [.td-markdown_&_>_:last-child]:mb-0"
            aria-busy="true"
          />
        }
      >
        <MarkdownNotes
          documentId={task.id}
          editorRef={editorRef}
          markdown={task.notes}
          readOnly={task.deleted}
          onReady={onReady}
          onChange={(notes) => taskActions.update(task.id, { notes })}
        />
      </Suspense>
    </ErrorBoundary>
  );
}
