import { useCallback, useRef, useState } from 'react';
import type { AppPreferences } from '#application';

export function usePreferences(
  initial: AppPreferences,
  persist: (patch: Partial<AppPreferences>) => Promise<void>,
) {
  const [preferences, setPreferences] = useState(initial);
  const currentRef = useRef(initial);
  const pendingRef = useRef<Partial<AppPreferences>>({});
  const revisionRef = useRef(0);
  const queueRef = useRef(Promise.resolve());
  const [preferenceSaveState, setPreferenceSaveState] = useState<'saved' | 'saving' | 'error'>(
    'saved',
  );

  const save = useCallback(() => {
    const revision = ++revisionRef.current;
    setPreferenceSaveState('saving');
    queueRef.current = queueRef.current
      .catch(() => undefined)
      .then(async () => {
        const patch = pendingRef.current;
        if (Object.keys(patch).length === 0) {
          return;
        }
        await persist(patch);

        // An acknowledgment clears only the changes it saved, never newer edits.
        const remaining = { ...pendingRef.current };
        for (const [key, value] of Object.entries(patch)) {
          if (key !== 'taskViews' && Reflect.get(remaining, key) === value) {
            Reflect.deleteProperty(remaining, key);
          }
        }
        const views = { ...remaining.taskViews };
        for (const [scope, options] of Object.entries(patch.taskViews ?? {})) {
          if (views[scope] === options) {
            delete views[scope];
          }
        }
        if (Object.keys(views).length) {
          remaining.taskViews = views;
        } else {
          delete remaining.taskViews;
        }
        pendingRef.current = remaining;
      });
    void queueRef.current.then(
      () => {
        if (revisionRef.current === revision) {
          setPreferenceSaveState('saved');
        }
      },
      () => {
        if (revisionRef.current === revision) {
          setPreferenceSaveState('error');
        }
      },
    );
  }, [persist]);

  const updatePreferences = useCallback(
    (patch: Partial<AppPreferences>) => {
      currentRef.current = {
        ...currentRef.current,
        ...patch,
        taskViews: { ...currentRef.current.taskViews, ...patch.taskViews },
      };
      pendingRef.current = {
        ...pendingRef.current,
        ...patch,
        ...(patch.taskViews
          ? { taskViews: { ...pendingRef.current.taskViews, ...patch.taskViews } }
          : {}),
      };
      setPreferences(currentRef.current);
      save();
    },
    [save],
  );

  return { preferences, updatePreferences, preferenceSaveState, retryPreferences: save };
}
