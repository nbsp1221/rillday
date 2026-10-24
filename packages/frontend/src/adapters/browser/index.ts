import { BroadcastChannelNetworkAdapter } from '@automerge/automerge-repo-network-broadcastchannel';
import { IndexedDBStorageAdapter } from '@automerge/automerge-repo-storage-indexeddb';
import type { ApplicationStorage } from '#application/application';
import { RemoteWorkspaceNetwork } from '../automerge/remote-network.ts';
import { sharedSnapshotStorage } from '../automerge/shared-snapshot-storage.ts';
import { AutomergeWorkspaceDocuments } from '../automerge/workspace-documents.ts';
import { BrowserWorkspaceRepository } from './browser.ts';

export function createIndexedDbStorage({
  demo = false,
  localOnly = false,
}: { demo?: boolean; localOnly?: boolean } = {}): ApplicationStorage {
  const repository = new BrowserWorkspaceRepository({ demo });
  const disk = new IndexedDBStorageAdapter(demo ? 'rillday-demo-documents' : 'rillday-documents');
  const shared = sharedSnapshotStorage(disk, (key, action) =>
    navigator.locks.request(`rillday-document:${key}`, action),
  );
  const documents = new AutomergeWorkspaceDocuments(
    { ...shared, remove: disk.remove.bind(disk) },
    (id, remote) => {
      if (localOnly && remote) {
        throw new Error('demo_server_disabled');
      }
      const broadcast = new BroadcastChannelNetworkAdapter({
        channelName: `rillday-document:${demo ? 'demo:' : ''}${id}`,
      });
      const network = remote ? new RemoteWorkspaceNetwork(remote, id) : undefined;
      return {
        owned: {
          adapters: network ? [broadcast, network] : [broadcast],
          dispose: () => {
            broadcast.disconnect();
            network?.disconnect();
          },
        },
        synchronization: network ? (document) => network.synchronization(document) : undefined,
      };
    },
  );
  return { accounts: repository, preferences: repository, documents, close: () => disk.close() };
}

export { withWorkspaceLock } from './tab-coordination.ts';
export { createBrowserCredentialSession } from './credentials.ts';
