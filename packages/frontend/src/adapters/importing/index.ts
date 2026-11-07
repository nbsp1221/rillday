import type { HabitImportReader } from '../../application/importing/habit-import.ts';

export function createHabitImportReader(): HabitImportReader {
  return {
    read: (input, signal) =>
      new Promise((resolve, reject) => {
        signal.throwIfAborted();
        const worker = new Worker(new URL('./habit-import.worker.ts', import.meta.url), {
          type: 'module',
        });

        const finish = () => {
          worker.terminate();
          signal.removeEventListener('abort', abort);
        };

        const abort = () => {
          finish();
          reject(new DOMException('Cancelled', 'AbortError'));
        };

        signal.addEventListener('abort', abort, { once: true });
        worker.onmessage = (
          event: MessageEvent<{
            draft?: Awaited<ReturnType<HabitImportReader['read']>>;
            error?: string;
          }>,
        ) => {
          finish();
          if (event.data.draft) {
            resolve(event.data.draft);
          } else {
            reject(new Error(event.data.error ?? 'invalid_import_format'));
          }
        };
        worker.onerror = () => {
          finish();
          reject(new Error('invalid_import_format'));
        };
        try {
          worker.postMessage(input, [input.bytes]);
        } catch (error) {
          finish();
          reject(error instanceof Error ? error : new Error('invalid_import_format'));
        }
      }),
  };
}
