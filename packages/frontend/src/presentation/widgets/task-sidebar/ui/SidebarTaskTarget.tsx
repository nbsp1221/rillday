import { pointerIntersection } from '@dnd-kit/collision';
import { useDragOperation, useDroppable } from '@dnd-kit/react';
import { type ReactNode, useRef } from 'react';
import { useI18n } from '#shared/i18n';

interface SidebarDropProps {
  'ref': (element: HTMLElement | null) => void;
  'data-task-drop': string | undefined;
  'data-drop-active': true | undefined;
  'aria-description': string | undefined;
}

export function SidebarTaskTarget({
  scope,
  name,
  children,
}: {
  scope?: string;
  name: string;
  children: (props: SidebarDropProps) => ReactNode;
}) {
  const elementRef = useRef<HTMLElement>(null);
  const { source } = useDragOperation();
  const { t } = useI18n();
  const disabled =
    !scope ||
    (source !== null &&
      source !== undefined &&
      (source.data.canDrag === false || scope === `list:${source.data.listId}`));
  const label =
    scope === 'trash'
      ? t('drag.trash')
      : scope === 'completed'
        ? t('drag.complete')
        : t('drag.toList', { name });
  const { isDropTarget } = useDroppable({
    id: `sidebar:${scope ?? name}`,
    element: elementRef,
    accept: 'task',
    disabled,
    collisionDetector: pointerIntersection,
    data: { sidebarScope: scope, dropLabel: label },
  });
  return children({
    'ref': (element) => {
      elementRef.current = element;
    },
    'data-task-drop': scope,
    'data-drop-active': isDropTarget || undefined,
    'aria-description': isDropTarget ? label : undefined,
  });
}
