import { pointerIntersection } from '@dnd-kit/collision';
import { useDroppable } from '@dnd-kit/react';
import { type HTMLAttributes, createElement, useMemo } from 'react';

export function CalendarDropZone({
  as = 'div',
  kind,
  date,
  dropId,
  dates,
  ...props
}: HTMLAttributes<HTMLElement> & {
  as?: 'div' | 'button' | 'aside';
  kind: 'date' | 'time' | 'all-day' | 'undated';
  date: string | null;
  dropId?: string;
  dates?: string[];
}) {
  const id = dropId ?? `${kind}:${date ?? ''}`;
  const data = useMemo(() => ({ kind, date, dates }), [kind, date, dates]);
  const { ref, isDropTarget } = useDroppable({
    id,
    accept: 'task',
    data,
    collisionDetector: pointerIntersection,
  });
  return createElement(as, {
    ...props,
    ref,
    'data-calendar-drop': kind,
    'data-calendar-drop-id': id,
    'data-date': date ?? undefined,
    'data-drop-active': (kind !== 'time' && isDropTarget) || undefined,
  });
}
