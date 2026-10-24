import { IndexedDBStorageAdapter } from '@automerge/automerge-repo-storage-indexeddb';
import { createServer } from '@repo/server/runtime';
import { createServerFixture } from '@repo/test-support';
import { IDBFactory } from 'fake-indexeddb';
import { onTestFinished, vi } from 'vitest';
import 'fake-indexeddb/auto';
import { RemoteWorkspaceNetwork } from '../../../src/adapters/automerge/remote-network.ts';
import { AutomergeWorkspaceDocuments } from '../../../src/adapters/automerge/workspace-documents.ts';
import { createIndexedDbStorage, withWorkspaceLock } from '../../../src/adapters/browser/index.ts';
import { createFetchServerTransport } from '../../../src/adapters/http/server-transport.ts';
import { createApplication } from '../../../src/application/application.ts';

export const context = { now: () => '2026-10-23T10:00:00.000Z', newId: () => crypto.randomUUID() };

export const fixture = createServerFixture((options) =>
  createServer({ ...options, logger: false }),
);

export function device() {
  const disk = new IndexedDBStorageAdapter('server-device-' + crypto.randomUUID());
  onTestFinished(() => disk.close());
  return new AutomergeWorkspaceDocuments(disk, (id, remote) => {
    const network = remote ? new RemoteWorkspaceNetwork(remote, id) : undefined;
    return {
      owned: { adapters: network ? [network] : [], dispose: () => network?.disconnect() },
      synchronization: network ? (document) => network.synchronization(document) : undefined,
    };
  });
}

export function application(token: string, { reset = true } = {}) {
  if (reset) {
    vi.stubGlobal('indexedDB', new IDBFactory());
  }
  const credentials = {
    restore: vi.fn().mockResolvedValue(token),
    remember: vi.fn(),
    forget: vi.fn(),
  };
  const storage = createIndexedDbStorage();
  const app = createApplication({
    transport: createFetchServerTransport(),
    storage,
    coordination: { withWorkspaceLock },
    runtime: 'web',
    credentials,
  });
  onTestFinished(() => app.dispose());
  return { app, credentials, storage };
}

export function socketFor(origin: string, documentId: string) {
  const url = new URL('/v1/workspace/' + documentId, origin);
  url.protocol = 'ws:';
  const socket = new WebSocket(url);
  onTestFinished(() => socket.close());
  return socket;
}
