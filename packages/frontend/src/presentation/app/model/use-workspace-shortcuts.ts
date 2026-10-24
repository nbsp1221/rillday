import { useEffect } from 'react';
import type { ConnectionPort, TaskActions } from '#application';

export function useWorkspaceShortcuts({
  connection,
  settingsOpen,
  closeSettings,
  openSearch,
  beginCapture,
  undo,
  redo,
}: {
  connection: ConnectionPort;
  settingsOpen: boolean;
  closeSettings: () => void;
  openSearch: () => void;
  beginCapture: () => void;
  undo: TaskActions['undo'];
  redo: TaskActions['redo'];
}) {
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (
        connection.getSnapshot().transitioning ||
        event.defaultPrevented ||
        event.isComposing ||
        event.keyCode === 229
      ) {
        return;
      }
      if (event.key === 'Escape' && settingsOpen) {
        event.preventDefault();
        closeSettings();
        return;
      }

      const modifier = event.ctrlKey || event.metaKey;
      if (modifier && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        openSearch();
        return;
      }
      if (modifier && event.key.toLowerCase() === 'n') {
        event.preventDefault();
        beginCapture();
        return;
      }
      if (
        settingsOpen ||
        (event.target as HTMLElement).closest(
          'input,textarea,[contenteditable],[role=dialog],[role=alertdialog]',
        )
      ) {
        return;
      }
      if (modifier && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) {
          redo();
        } else {
          undo();
        }
      }
      if (modifier && event.key.toLowerCase() === 'y') {
        event.preventDefault();
        redo();
      }
    };

    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [connection, settingsOpen, closeSettings, openSearch, beginCapture, undo, redo]);
}
