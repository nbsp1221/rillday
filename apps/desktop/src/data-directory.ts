import type { Application, DataDirectoryPort } from '@repo/frontend/application';
import { invoke } from '@tauri-apps/api/core';

export function desktopDataDirectory(application: Application): DataDirectoryPort {
  return {
    current: () => invoke<string>('data_directory_info'),
    choose: (title) => invoke<string | null>('data_directory_choose', { title }),
    activate: async (path) => {
      await application.flushForExit();
      await invoke('data_directory_use', { path });
    },
  };
}
