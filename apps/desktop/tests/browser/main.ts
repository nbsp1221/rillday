import { mockIPC } from '@tauri-apps/api/mocks';

mockIPC((command) => {
  if (command === 'data_directory_setup') {
    return 'C:\\Users\\Example\\AppData\\Local\\dev.rillday.workspace';
  }
  throw new Error(`Unexpected native command: ${command}`);
});
await import('../../src/main');
