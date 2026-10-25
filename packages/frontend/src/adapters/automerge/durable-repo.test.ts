import { generateAutomergeUrl, parseAutomergeUrl } from '@automerge/automerge-repo';
import 'fake-indexeddb/auto';
import { MessageChannelNetworkAdapter } from '@automerge/automerge-repo-network-messagechannel';
import { IndexedDBStorageAdapter } from '@automerge/automerge-repo-storage-indexeddb';
import { expect, test, vi } from 'vitest';
import { DurableRepo } from './durable-repo.ts';

test('supported binary persistence reports failure and retries the complete current document', async () => {
  const disk = new IndexedDBStorageAdapter(`durability-${crypto.randomUUID()}`);
  let failure = false;
  const storage = {
    load: disk.load.bind(disk),
    loadRange: disk.loadRange.bind(disk),
    remove: disk.remove.bind(disk),
    removeRange: disk.removeRange.bind(disk),
    save: (key: string[], data: Uint8Array) =>
      failure ? Promise.reject(new Error('disk_full')) : disk.save(key, data),
  };
  const workspace = await DurableRepo.create(storage, {
    task: { priority: 0, completed: false },
    next: null as null | { title: string },
  });
  try {
    failure = true;
    await expect(
      workspace.change((doc) => {
        doc.task.completed = true;
        doc.next = { title: 'Tomorrow' };
      }),
    ).rejects.toThrow('disk_full');
    expect(workspace.saved).toBe(false);
    const beforeRetry = await DurableRepo.open<{
      task: { priority: number; completed: boolean };
      next: null | { title: string };
    }>(storage, workspace.handle.documentId);
    try {
      expect(beforeRetry.handle.fullDoc()).toMatchObject({
        task: { completed: false },
        next: null,
      });
    } finally {
      await beforeRetry.close();
    }
    failure = false;
    await workspace.retrySave();
    expect(workspace.saved).toBe(true);
    const reopened = await DurableRepo.open<{
      task: { completed: boolean };
      next: { title: string };
    }>(storage, workspace.handle.documentId);
    try {
      expect(reopened.handle.fullDoc()).toMatchObject({
        task: { completed: true },
        next: { title: 'Tomorrow' },
      });
    } finally {
      await reopened.close();
    }
  } finally {
    failure = false;
    await workspace.close();
  }
});

test('official network adapters exchange disjoint changes; both replicas persist and restart offline', async () => {
  const firstDisk = new IndexedDBStorageAdapter(`first-${crypto.randomUUID()}`);
  const secondDisk = new IndexedDBStorageAdapter(`second-${crypto.randomUUID()}`);
  const channel = new MessageChannel();
  const first = await DurableRepo.create(
    firstDisk,
    { task: { priority: 0, pinned: false } },
    () => ({
      adapters: [new MessageChannelNetworkAdapter(channel.port1)],
      dispose: () => channel.port1.close(),
    }),
  );
  const entry = await first.repo.export(first.handle.url);
  expect.assert(entry !== undefined);
  await secondDisk.save([first.handle.documentId, 'workspace'], entry);
  await first.change((doc) => {
    doc.task.priority = 3;
  });
  const second = await DurableRepo.open<{ task: { priority: number; pinned: boolean } }>(
    secondDisk,
    first.handle.documentId,
    () => ({
      adapters: [new MessageChannelNetworkAdapter(channel.port2)],
      dispose: () => channel.port2.close(),
    }),
  );
  try {
    await second.change((doc) => {
      doc.task.pinned = true;
    });
    await expect
      .poll(() => first.handle.fullDoc().task)
      .toMatchObject({ priority: 3, pinned: true });
    await expect
      .poll(() => second.handle.fullDoc().task)
      .toMatchObject({ priority: 3, pinned: true });
    await Promise.all([first.flush(), second.flush()]);
    const reopened = await DurableRepo.open<{ task: { priority: number; pinned: boolean } }>(
      secondDisk,
      first.handle.documentId,
    );
    try {
      expect(reopened.handle.fullDoc().task).toMatchObject({ priority: 3, pinned: true });
    } finally {
      await reopened.close();
    }
  } finally {
    channel.port1.close();
    channel.port2.close();
    await Promise.all([first.close(), second.close()]);
  }
});

test('closing quiesces networking before draining the last accepted write and rejects later changes', async () => {
  const disk = new IndexedDBStorageAdapter(`closing-${crypto.randomUUID()}`);
  const firstWrite = Promise.withResolvers<void>();
  const secondWrite = Promise.withResolvers<void>();
  const secondStarted = Promise.withResolvers<void>();
  let paused = false;
  let writes = 0;
  const storage = {
    load: disk.load.bind(disk),
    loadRange: disk.loadRange.bind(disk),
    remove: disk.remove.bind(disk),
    removeRange: disk.removeRange.bind(disk),
    async save(key: string[], bytes: Uint8Array) {
      if (paused) {
        if (++writes === 1) {
          await firstWrite.promise;
        } else {
          secondStarted.resolve();
          await secondWrite.promise;
        }
      }
      await disk.save(key, bytes);
    },
  };
  const workspace = await DurableRepo.create(storage, { task: { priority: 0, pinned: false } });
  const shutdown = workspace.repo.shutdown.bind(workspace.repo);
  const spy = vi.spyOn(workspace.repo, 'shutdown').mockImplementation(() => {
    workspace.handle.change((doc) => {
      doc.task.pinned = true;
    });
    return shutdown();
  });
  try {
    paused = true;
    const edited = workspace.change((doc) => {
      doc.task.priority = 3;
    });
    let closed = false;
    const closing = workspace.close().then(() => {
      closed = true;
    });
    firstWrite.resolve();
    await secondStarted.promise;
    expect(closed).toBe(false);
    expect(() =>
      workspace.change((doc) => {
        doc.task.priority = 1;
      }),
    ).toThrow('workspace_closed');
    secondWrite.resolve();
    await Promise.all([edited, closing]);
    const reopened = await DurableRepo.open<{ task: { priority: number; pinned: boolean } }>(
      disk,
      workspace.handle.documentId,
    );
    try {
      expect(reopened.handle.fullDoc().task).toEqual({ priority: 3, pinned: true });
    } finally {
      await reopened.close();
    }
  } finally {
    firstWrite.resolve();
    secondWrite.resolve();
    spy.mockRestore();
    await workspace.close();
  }
});

test.each(['missing', 'corrupt', 'create'] as const)(
  'failed %s initialization releases the owned network',
  async (failure) => {
    const disk = new IndexedDBStorageAdapter(`factory-${crypto.randomUUID()}`);
    const dispose = vi.fn();

    const network = () => ({ adapters: [], dispose });

    const { documentId } = parseAutomergeUrl(generateAutomergeUrl());

    if (failure === 'corrupt') {
      await disk.save([documentId, 'workspace'], new Uint8Array([1, 2, 3]));
    }
    const opening =
      failure === 'create'
        ? DurableRepo.create(
            disk,
            {
              get title() {
                throw new Error('create_failed');
              },
            },
            network,
          )
        : DurableRepo.open(disk, documentId, network);
    await expect(opening).rejects.toThrow();
    expect(dispose).toHaveBeenCalledTimes(1);
  },
);
