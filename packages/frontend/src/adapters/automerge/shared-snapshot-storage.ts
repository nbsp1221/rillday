import * as Automerge from '@automerge/automerge';
import type { SnapshotStorage } from './durable-repo.ts';

type StorageLock = (key: string, action: () => Promise<void>) => Promise<void>;

export function sharedSnapshotStorage(
  storage: SnapshotStorage,
  withLock: StorageLock,
): SnapshotStorage {
  return {
    load: storage.load.bind(storage),
    save: (key, data) =>
      withLock(JSON.stringify(key), async () => {
        const saved = await storage.load(key);
        // A saved tab edit must survive even if BroadcastChannel delivery is delayed.
        if (!saved) {
          await storage.save(key, data);
          return;
        }
        const incoming = Automerge.load(data);
        let persisted: ReturnType<typeof Automerge.load> | undefined;
        try {
          persisted = Automerge.load(saved);
          const next = Automerge.save(Automerge.merge(incoming, persisted));
          await storage.save(key, next);
        } finally {
          Automerge.free(incoming);
          if (persisted) {
            Automerge.free(persisted);
          }
        }
      }),
  };
}
