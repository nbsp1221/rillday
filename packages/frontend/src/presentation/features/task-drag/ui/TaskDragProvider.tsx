import {
  Accessibility,
  type DragEndEvent,
  type DragStartEvent,
  KeyboardSensor,
  PointerActivationConstraints,
  PointerSensor,
} from '@dnd-kit/dom';
import {
  DragDropProvider,
  DragOverlay,
  useDragDropManager,
  useDragOperation,
} from '@dnd-kit/react';
import { type ReactNode, useEffect } from 'react';
import { useI18n } from '#shared/i18n';

const sensors = [
  PointerSensor.configure({
    preventActivation: (_event, source) => source.data.canDrag === false,
    activationConstraints: (event) =>
      event.pointerType === 'touch'
        ? [new PointerActivationConstraints.Delay({ value: 250, tolerance: 5 })]
        : [new PointerActivationConstraints.Distance({ value: 4 })],
  }),
  KeyboardSensor.configure({
    preventActivation: (event, source) => event.code !== 'Space' || source.data.canDrag === false,
  }),
];

function CancelOnContextChange({ identity }: { identity: string }) {
  const manager = useDragDropManager();
  useEffect(() => {
    manager?.actions.stop({ canceled: true });
  }, [identity, manager]);
  useEffect(() => {
    const cancel = () => manager?.actions.stop({ canceled: true });

    // dnd-kit's resize listener otherwise treats a keyboard drag as a completed drop.
    window.addEventListener('resize', cancel, true);
    return () => window.removeEventListener('resize', cancel, true);
  }, [manager]);
  return null;
}

function DropAnnouncement() {
  const { source, target } = useDragOperation();
  return (
    <span
      className="task-drag-announcement fixed top-0 left-0 w-[1px] h-[1px] overflow-hidden [clip-path:inset(50%)] whitespace-nowrap"
      aria-live="polite"
    >
      {source && typeof target?.data.dropLabel === 'string' ? target.data.dropLabel : ''}
    </span>
  );
}

function TaskDragPreview({ title }: { title: string }) {
  const manager = useDragDropManager();
  const operation = manager?.dragOperation;
  const box = operation?.shape?.initial.boundingRectangle;
  const point = operation?.position.initial;
  // Offset the preview from the original grab point without tracking pointer
  // frames in React. The library still moves the overlay on every input frame.
  const offset =
    box && point
      ? `translate(${point.x - box.left + 12}px,${point.y - box.top + 12}px)`
      : undefined;
  return (
    <div
      className="task-drag-overlay w-[max-content] max-w-[min(280px,_calc(100vw_-_24px))] overflow-hidden text-ellipsis whitespace-nowrap border border-transparent py-1.5 px-3 ring-1 ring-foreground/10 rounded-sm bg-popover text-popover-foreground shadow-md text-sm leading-(--text-sm--line-height)"
      aria-hidden="true"
      style={{ transform: offset }}
    >
      {title}
    </div>
  );
}

export function TaskDragProvider({
  children,
  identity,
}: {
  children: ReactNode;
  identity: string;
}) {
  const { t } = useI18n();
  const accessibility = Accessibility.configure({
    screenReaderInstructions: {
      draggable: t('drag.keyboardInstructions'),
    },
    announcements: {
      dragstart: (event: DragStartEvent) =>
        t('drag.pickedUp', { v0: String(event.operation.source?.data.title ?? '') }),
      dragend: (event: DragEndEvent) => t(event.canceled ? 'drag.cancelled' : 'drag.finished'),
    },
  });
  return (
    <DragDropProvider
      sensors={sensors}
      plugins={(defaults) =>
        defaults.map((plugin) => (plugin === Accessibility ? accessibility : plugin))
      }
    >
      <CancelOnContextChange identity={identity} />
      {children}
      <DropAnnouncement />
      <DragOverlay
        className="task-pointer-overlay pointer-events-none"
        // A zero-duration animation preserves dnd-kit's keyboard focus restoration.
        dropAnimation={{ duration: 0 }}
        style={{ pointerEvents: 'none', zIndex: 200 }}
      >
        {(source) => <TaskDragPreview title={String(source.data.title ?? '')} />}
      </DragOverlay>
    </DragDropProvider>
  );
}
