import { Button as ButtonPrimitive } from '@base-ui/react/button';
import { pointerIntersection } from '@dnd-kit/collision';
import { useDragDropMonitor, useDragOperation, useDroppable } from '@dnd-kit/react';
import { Plus, Settings2 } from 'lucide-react';
import { type CSSProperties, type ReactNode, useRef, useState } from 'react';
import { type Quadrant, type Task, taskBelongsToQuadrant } from '#application';
import { useWorkspace } from '#entities/workspace';
import { useI18n } from '#shared/i18n';
import { TaskItems } from '#widgets/task-list';
import { WorkspaceHeader } from '../../../shared/ui/WorkspaceHeader';
import { MatrixSettings } from './MatrixSettings';
import { QuadrantComposer } from './QuadrantComposer';

export function MatrixView() {
  const { t } = useI18n();
  const { data, taskActions } = useWorkspace();
  const [settings, setSettings] = useState(false);
  const [adding, setAdding] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const triggersRef = useRef(new Map<string, HTMLElement>());
  const mode = data.matrixMode ?? 'simple';
  const tasks = data.tasks.filter((task) => !task.deleted && !task.completedAt);
  const { source } = useDragOperation();
  const dragged = tasks.find((task) => task.id === source?.data.taskId);

  const belongs = (task: Task, quadrant: Quadrant) => taskBelongsToQuadrant(task, quadrant, mode);

  function openAdd(id: string) {
    if (adding !== id) {
      setAdding(id);
    } else {
      inputRef.current?.focus();
    }
  }

  function closeAdd() {
    const trigger = adding ? triggersRef.current.get(adding) : undefined;
    setAdding(null);
    trigger?.focus();
  }

  useDragDropMonitor({
    onDragEnd(event) {
      const drop = event.operation.target;
      const id: unknown = event.operation.source?.data.taskId;
      const quadrant = data.quadrants.find((item) => item.id === drop?.data.quadrant);
      const point = event.operation.position.current;
      const box = drop?.shape?.boundingRectangle;

      if (
        !event.canceled &&
        typeof id === 'string' &&
        quadrant &&
        box &&
        point.x >= box.left &&
        point.x < box.right &&
        point.y >= box.top &&
        point.y < box.bottom
      ) {
        taskActions.moveToQuadrant(id, quadrant.id);
      }
    },
  });

  return (
    <section
      className="matrix-view h-full flex flex-col min-h-0"
      data-dragging={Boolean(dragged) || undefined}
    >
      <WorkspaceHeader title={t('area.matrix', { ns: 'labels' })}>
        <ButtonPrimitive
          aria-label={t('matrix.settings')}
          onClick={() => setSettings(true)}
          className={
            'icon-button inline-flex items-center justify-center rounded-sm w-7 h-7 p-0 text-muted-foreground hover:text-foreground hover:bg-surface-hover'
          }
        >
          <Settings2 className="size-4 inline-block shrink-0 align-middle" />
        </ButtonPrimitive>
      </WorkspaceHeader>
      <div className="matrix-grid grid grid-cols-[repeat(2,_minmax(0,_1fr))] grid-rows-[repeat(2,_minmax(0,_1fr))] flex-1 min-h-0 gap-3 p-(--layout-page-inset) [@media(max-width:_899px)]:p-(--layout-page-inset-compact) [@media(max-width:_600px)]:flex [@media(max-width:_600px)]:flex-col [@media(max-width:_600px)]:overflow-auto [&::-webkit-scrollbar]:size-[7px] [&::-webkit-scrollbar-thumb]:rounded-lg [&::-webkit-scrollbar-thumb]:bg-scrollbar [&::-webkit-scrollbar-thumb:hover]:bg-scrollbar-hover">
        {data.quadrants.map((quadrant) => {
          const title = quadrant.name ?? t(`quadrant.${quadrant.id}`, { ns: 'labels' });
          const items = tasks
            .filter((task) => belongs(task, quadrant))
            .sort(
              (a, b) =>
                Number(b.pinned) - Number(a.pinned) ||
                (a.date && b.date
                  ? a.date.localeCompare(b.date)
                  : Number(!a.date) - Number(!b.date)) ||
                (a.time ?? '').localeCompare(b.time ?? '') ||
                a.order - b.order,
            );

          return (
            <QuadrantDrop
              key={quadrant.id}
              quadrant={quadrant}
              label={title}
              disabled={dragged !== undefined && belongs(dragged, quadrant)}
            >
              <header className="quadrant-header flex items-center shrink-0 gap-2 min-h-7 mx-(--quadrant-inset) text-foreground [&_h2]:flex-1 [&_h2]:min-w-0 [&_h2]:m-0 [&_h2]:text-sm [&_h2]:leading-(--text-sm--line-height) [&_h2]:font-medium [&_h2]:wrap-anywhere">
                <span
                  className="quadrant-dot w-1.5 h-1.5 shrink-0 rounded-full bg-quadrant-color"
                  aria-hidden="true"
                />
                <h2>{title}</h2>
                <span className="quadrant-count shrink-0 text-xs leading-(--text-xs--line-height) tabular-nums text-muted-foreground">
                  {items.length}
                </span>
                <ButtonPrimitive
                  ref={(element) => {
                    if (element) {
                      triggersRef.current.set(quadrant.id, element);
                    } else {
                      triggersRef.current.delete(quadrant.id);
                    }
                  }}
                  aria-label={t('matrix.addToQuadrant', { v0: title })}
                  aria-expanded={adding === quadrant.id}
                  onClick={() => openAdd(quadrant.id)}
                  className={
                    'icon-button inline-flex items-center justify-center rounded-sm w-7 h-7 p-0 text-muted-foreground hover:text-foreground hover:bg-surface-hover quadrant-add-trigger'
                  }
                >
                  <Plus className="size-4 inline-block shrink-0 align-middle" />
                </ButtonPrimitive>
              </header>
              {adding === quadrant.id && (
                <QuadrantComposer quadrantId={quadrant.id} inputRef={inputRef} close={closeAdd} />
              )}
              <div className="quadrant-tasks flex-1 min-h-0 overflow-auto [&::-webkit-scrollbar]:size-[7px] [&::-webkit-scrollbar-thumb]:rounded-lg [&::-webkit-scrollbar-thumb]:bg-scrollbar [&::-webkit-scrollbar-thumb:hover]:bg-scrollbar-hover [scrollbar-gutter:stable_both-edges] px-(--quadrant-inset) [@media(min-width:_601px)]:[@supports(selector(::-webkit-scrollbar))]:px-[calc(var(--quadrant-inset)_-_var(--scrollbar-size))] [@media(max-width:_600px)]:overflow-visible [@media(max-width:_600px)]:[scrollbar-gutter:auto] [@media(max-width:_600px)]:px-(--quadrant-inset)">
                <TaskItems tasks={items} showList={false} compact showChildren={false} />
                {items.length === 0 && adding !== quadrant.id && (
                  <ButtonPrimitive
                    onClick={() => openAdd(quadrant.id)}
                    className={
                      'quadrant-empty [.matrix-view[data-dragging]_&]:invisible grid place-items-center w-full min-h-25 h-full p-4 rounded-sm text-muted-foreground text-sm leading-(--text-sm--line-height) text-center'
                    }
                  >
                    {t('matrix.empty')}
                  </ButtonPrimitive>
                )}
              </div>
            </QuadrantDrop>
          );
        })}
      </div>
      {settings && <MatrixSettings close={() => setSettings(false)} />}
    </section>
  );
}

function QuadrantDrop({
  quadrant,
  label,
  disabled,
  children,
}: {
  quadrant: Quadrant;
  label: string;
  disabled: boolean;
  children: ReactNode;
}) {
  const { ref, isDropTarget } = useDroppable({
    id: `quadrant:${quadrant.id}`,
    accept: 'task',
    disabled,
    collisionDetector: pointerIntersection,
    data: { quadrant: quadrant.id, dropLabel: disabled ? undefined : label },
  });

  return (
    <section
      ref={ref}
      className="quadrant [--quadrant-inset:var(--layout-card-inset)] flex flex-col min-w-0 min-h-0 gap-3 py-(--quadrant-inset) overflow-hidden rounded-lg bg-surface-inset [transition:background_0.12s,_box-shadow_0.12s] [&[data-drop-active]]:[background:color-mix(in_srgb,_var(--quadrant-color)_14%,_var(--surface-inset))] [@media(max-width:_600px)]:shrink-0 [@media(max-width:_600px)]:min-h-50 [@media(prefers-reduced-motion:_reduce)]:[transition:none]"
      data-matrix-drop={quadrant.id}
      data-drop-active={(!disabled && isDropTarget) || undefined}
      aria-label={label}
      style={{ '--quadrant-color': quadrant.color } as CSSProperties}
    >
      {children}
    </section>
  );
}
