import { useCallback, useEffect, useState } from 'react';
import { Workbox } from 'workbox-window';
import type { Application } from '#application';
import { AppUpdateNotice } from '#shared/ui/AppUpdateNotice';

export function PwaUpdates({
  application,
  serviceWorkerUrl,
}: {
  application: Application;
  serviceWorkerUrl: string;
}) {
  const [worker, setWorker] = useState<Workbox>();
  const [available, setAvailable] = useState(false);
  const [reloadNeeded, setReloadNeeded] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [failed, setFailed] = useState(false);

  const flush = useCallback(() => application.flushForExit(), [application]);

  const reload = useCallback(async () => {
    setUpdating(true);
    setFailed(false);
    try {
      await flush();
      window.location.reload();
    } catch {
      setFailed(true);
      setUpdating(false);
    }
  }, [flush]);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) {
      return;
    }
    const workbox = new Workbox(serviceWorkerUrl);
    let registration: ServiceWorkerRegistration | undefined;
    let stopped = false;
    let waiting = false;

    const ready = () => {
      waiting = true;
      setAvailable(true);
    };

    const controlling = () => {
      // Initial installation also claims clients. Only a waiting update needs a reload.
      if (waiting) {
        setAvailable(true);
        setReloadNeeded(true);
        void reload();
      }
    };

    const check = () => {
      if (registration?.waiting && document.visibilityState === 'visible') {
        ready();
      }
      if (
        registration &&
        !registration.installing &&
        navigator.onLine &&
        document.visibilityState === 'visible'
      ) {
        // Retry transient offline/server failures on the next foreground or online event.
        void workbox.update().catch(() => undefined);
      }
    };

    workbox.addEventListener('waiting', ready);
    workbox.addEventListener('controlling', controlling);
    void workbox
      .register({ immediate: true })
      .then((registered) => {
        if (!stopped) {
          registration = registered;
          setWorker(workbox);
          check();
        }
      })
      .catch((error: unknown) => console.warn('Unable to register app updates', error));

    const timer = setInterval(check, 60 * 60 * 1000);
    window.addEventListener('online', check);
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', check);
    return () => {
      stopped = true;
      clearInterval(timer);
      workbox.removeEventListener('waiting', ready);
      workbox.removeEventListener('controlling', controlling);
      window.removeEventListener('online', check);
      window.removeEventListener('focus', check);
      document.removeEventListener('visibilitychange', check);
    };
  }, [reload, serviceWorkerUrl]);

  async function update() {
    if (reloadNeeded) {
      await reload();
      return;
    }
    setUpdating(true);
    setFailed(false);
    try {
      await flush();
      worker?.messageSkipWaiting();
    } catch {
      setFailed(true);
      setUpdating(false);
    }
  }

  return available ? (
    <AppUpdateNotice
      updating={updating}
      failed={failed}
      update={() => void update()}
      dismiss={() => setAvailable(false)}
    />
  ) : null;
}
