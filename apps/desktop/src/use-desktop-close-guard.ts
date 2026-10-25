import type { Application } from '@repo/frontend/application';
import { useEffect } from 'react';

interface CloseWindow {
  onCloseRequested(handler: (event: { preventDefault(): void }) => void): Promise<() => void>;
  destroy(): Promise<void>;
}

export function registerCloseGuard(
  window: CloseWindow,
  flush: () => Promise<void>,
  reportSaveError: () => void,
) {
  let closing = false;
  return window.onCloseRequested((event) => {
    event.preventDefault();
    if (closing) {
      return;
    }

    closing = true;
    void flush()
      .then(() => window.destroy())
      .catch(() => {
        closing = false;
        reportSaveError();
      });
  });
}

export function useDesktopCloseGuard(
  application: Application | undefined,
  reportError: (code: string) => void,
) {
  useEffect(() => {
    if (!application) {
      return;
    }

    let stopped = false;
    let unlisten: (() => void) | undefined;
    const registration = import('@tauri-apps/api/window').then(async ({ getCurrentWindow }) => {
      if (stopped) {
        return;
      }

      const window = getCurrentWindow();
      const release = await registerCloseGuard(
        window,
        () => application.flushForExit(),
        () => globalThis.dispatchEvent(new Event('rillday-close-save-error')),
      );

      // Cleanup can change this flag while native registration awaits.
      if (stopped as boolean) {
        release();
      } else {
        unlisten = release;
      }
    });
    void registration.catch(() => {
      if (!stopped) {
        reportError('startup.closeGuardUnavailable');
      }
    });

    return () => {
      stopped = true;
      unlisten?.();
    };
  }, [application, reportError]);
}
