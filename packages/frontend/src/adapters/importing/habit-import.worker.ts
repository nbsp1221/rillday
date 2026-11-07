import { parseHabitFile } from './parse-habits.ts';

self.onmessage = (event: MessageEvent<Parameters<typeof parseHabitFile>[0]>) => {
  try {
    self.postMessage({ draft: parseHabitFile(event.data) });
  } catch (error) {
    self.postMessage({ error: error instanceof Error ? error.message : 'invalid_import_format' });
  }
};
