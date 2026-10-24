import type { Page } from '@playwright/test';

export function readBrowserStore(
  page: Page,
  database: string,
  store: string,
  key?: string | string[],
): Promise<unknown> {
  return page.evaluate(
    async ({ database, store, key }) => {
      let failed = false;
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(database);

        const fail = (reason: string, cause?: unknown) => {
          failed = true;
          reject(new Error(`${database}: ${reason}`, { cause }));
        };

        request.onupgradeneeded = () => {
          request.transaction?.abort();
          fail('expected an existing application database');
        };
        request.onblocked = () => fail('database open was blocked');
        request.onerror = () => fail('database open failed', request.error);
        request.onsuccess = () => {
          if (failed) {
            request.result.close();
          } else {
            resolve(request.result);
          }
        };
      });

      try {
        return await new Promise<unknown>((resolve, reject) => {
          const transaction = db.transaction(store);
          const objectStore = transaction.objectStore(store);
          const request = key === undefined ? objectStore.getAll() : objectStore.get(key);
          let result: unknown;
          request.onsuccess = () => {
            result = request.result;
          };
          transaction.oncomplete = () => {
            if (
              result &&
              typeof result === 'object' &&
              'binary' in result &&
              result.binary instanceof Uint8Array
            ) {
              const reader = new FileReader();
              reader.onload = () => {
                if (typeof reader.result !== 'string') {
                  reject(new Error('Expected an encoded document'));
                  return;
                }
                resolve({ document: reader.result.split(',')[1] });
              };
              reader.onerror = () => reject(reader.error ?? new Error('Cannot read document'));
              reader.readAsDataURL(new Blob([new Uint8Array(result.binary)]));
            } else {
              resolve(result);
            }
          };
          transaction.onerror = transaction.onabort = () =>
            reject(
              new Error(`${database}/${store}: read transaction failed`, {
                cause: transaction.error,
              }),
            );
        });
      } finally {
        db.close();
      }
    },
    { database, store, key },
  );
}
