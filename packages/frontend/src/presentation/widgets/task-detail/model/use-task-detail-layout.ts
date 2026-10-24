import { type RefObject, useLayoutEffect } from 'react';

export function useTaskDetailLayout({
  selectionId,
  panelRef,
}: {
  selectionId: string | null;
  panelRef: RefObject<HTMLElement | null>;
}) {
  useLayoutEffect(() => {
    panelRef.current?.querySelector('.td-body')?.scrollTo({ top: 0 });
  }, [selectionId, panelRef]);
}
