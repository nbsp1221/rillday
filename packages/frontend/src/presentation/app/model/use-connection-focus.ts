import { useEffect } from 'react';
import type { ConnectionPort } from '#application';

export function useConnectionFocus(connection: ConnectionPort | undefined) {
  useEffect(() => {
    if (!connection) {
      return;
    }
    let transitioning = false;
    let focused: HTMLElement | undefined;
    let frame = 0;
    const unsubscribe = connection.subscribe(() => {
      const next = Boolean(connection.getSnapshot().transitioning);
      if (next && !transitioning) {
        focused =
          document.activeElement instanceof HTMLElement ? document.activeElement : undefined;
      }
      if (!next && transitioning) {
        frame = requestAnimationFrame(() => {
          const target =
            focused?.isConnected && !focused.matches(':disabled')
              ? focused
              : document.querySelector<HTMLElement>(
                  '.sync-connection-review button,.sync-actions button,.sync-server-form input',
                );
          target?.focus({ preventScroll: true });
        });
      }
      transitioning = next;
    });
    return () => {
      unsubscribe();
      cancelAnimationFrame(frame);
    };
  }, [connection]);
}
