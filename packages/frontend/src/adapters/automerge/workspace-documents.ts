import * as Automerge from '@automerge/automerge';
import { type Workspace, includeWorkspace, validateWorkspace } from '@repo/domain';
import type { WorkspaceSynchronization } from '../../application/workspace-session.ts';
import type {
  OpenWorkspace,
  RemoteWorkspace,
  WorkspaceDocuments,
} from '../../application/workspace/documents.ts';
import { createDomainContext } from '../../application/context.ts';
import { DurableRepo, type OwnedNetwork, type SnapshotStorage } from './durable-repo.ts';
import { decodeWorkspaceArchive, encodeWorkspaceArchive } from './workspace-archive.ts';
import { type WorkspaceDocument, emptyDocument, writeWorkspace } from './workspace-document.ts';
import { AutomergeWorkspaceRepository } from './workspace-repository.ts';

export interface WorkspaceNetwork {
  owned: OwnedNetwork;
  synchronization?: (document: DurableRepo<WorkspaceDocument>) => WorkspaceSynchronization;
}

export interface WorkspaceDocumentStorage extends SnapshotStorage {
  remove(key: string[]): Promise<void>;
}

export class AutomergeWorkspaceDocuments implements WorkspaceDocuments {
  private readonly storage: WorkspaceDocumentStorage;
  private readonly createNetwork: (id: string, remote?: RemoteWorkspace) => WorkspaceNetwork;

  constructor(
    storage: WorkspaceDocumentStorage,
    createNetwork: (id: string, remote?: RemoteWorkspace) => WorkspaceNetwork,
  ) {
    this.storage = storage;
    this.createNetwork = createNetwork;
  }

  private opened(
    document: DurableRepo<WorkspaceDocument>,
    synchronization?: WorkspaceSynchronization,
  ): OpenWorkspace {
    const repository = new AutomergeWorkspaceRepository(document);
    return {
      repository,
      revision: () => Automerge.getHeads(document.handle.fullDoc()).sort().join(':'),
      pause: () => {
        document.repo.networkSubsystem.disconnect();
        return () => document.repo.networkSubsystem.reconnect();
      },
      exportData: async () => {
        await document.flush();
        return encodeWorkspaceArchive(document.handle.fullDoc());
      },
      includeArchive: async (source) => {
        const decoded = decodeWorkspaceArchive(source);
        if (decoded.hasDecisions) {
          throw new Error('edit_conflict');
        }
        const incoming = Automerge.load<WorkspaceDocument>(decoded.binary);
        try {
          const current = document.handle.fullDoc();
          const revision = Automerge.getHeads(incoming).sort().join(':');
          if (current.includedArchives[revision]) {
            await document.flush();
            return;
          }
          const sharedHistory = Automerge.getChangesMetaSince(incoming, []).some((change) =>
            Automerge.hasHeads(current, [change.hash]),
          );
          if (sharedHistory) {
            document.handle.update((draft) => Automerge.merge(draft, incoming));
            await document.flush();
            return;
          }
          const before = repository.getSnapshot().workspace;
          const included = includeWorkspace(before, decoded.workspace, createDomainContext());
          await document.change((draft) => {
            writeWorkspace(draft, before, included);
            draft.includedArchives[revision] = true;
          });
        } finally {
          Automerge.free(incoming);
        }
      },
      replaceArchive: async (source) => {
        const decoded = decodeWorkspaceArchive(source);
        const current = repository.getSnapshot();
        if (decoded.hasDecisions || current.decisions.length) {
          throw new Error('edit_conflict');
        }
        await document.change((draft) => {
          writeWorkspace(draft, current.workspace, decoded.workspace);
          for (const revision of Object.keys(draft.includedArchives)) {
            delete draft.includedArchives[revision];
          }
          Object.assign(draft.includedArchives, decoded.includedArchives);
        });
      },
      synchronization,
    };
  }

  async create(workspace: Workspace) {
    validateWorkspace(workspace);
    const document = await DurableRepo.create(this.storage, emptyDocument());
    const id = document.handle.documentId;
    try {
      // First document creation has no prior product records.
      const empty: Workspace = {
        tasks: {},
        lists: {},
        labels: {},
        habits: {},
        checkIns: {},
        quadrants: {},
        matrixMode: 'simple',
      };
      await document.change((draft) => writeWorkspace(draft, empty, workspace));
    } finally {
      await document.close();
    }
    return this.open(id);
  }

  async open(id: string, remote?: RemoteWorkspace) {
    let network: WorkspaceNetwork | undefined;
    const document = await DurableRepo.open<WorkspaceDocument>(
      this.storage,
      id,
      () => {
        network = this.createNetwork(id, remote);
        return network.owned;
      },
      remote ? AbortSignal.timeout(12000) : undefined,
    );
    try {
      return this.opened(document, network?.synchronization?.(document));
    } catch (error) {
      await document.close();
      throw error;
    }
  }

  inspectArchive(source: string) {
    return decodeWorkspaceArchive(source).workspace;
  }

  async restoreArchive(source: string) {
    const { binary } = decodeWorkspaceArchive(source);
    const document = await DurableRepo.restore<WorkspaceDocument>(this.storage, binary);
    const id = document.handle.documentId;
    await document.close();
    return this.open(id);
  }

  remove(id: string) {
    return this.storage.remove([id, 'workspace']);
  }
}
