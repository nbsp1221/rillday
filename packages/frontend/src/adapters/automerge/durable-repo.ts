import type { StorageAdapterInterface } from '@automerge/automerge-repo/slim';
import * as A from '@automerge/automerge';
import {
  type DocHandle,
  Repo,
  type RepoConfig,
  isValidDocumentId,
} from '@automerge/automerge-repo';

export type SnapshotStorage = Pick<StorageAdapterInterface, 'load' | 'save'>;

export interface OwnedNetwork {
  adapters: RepoConfig['network'];
  dispose(): void;
}

type NetworkFactory = () => OwnedNetwork;

const noNetwork: NetworkFactory = () => ({ adapters: [], dispose() {} });

export class DurableRepo<T> {
  readonly repo: Repo;
  readonly handle: DocHandle<T>;
  private saving: Promise<void> = Promise.resolve();
  private lastSaved: string[] = [];
  private readonly storage: SnapshotStorage;
  private readonly network: OwnedNetwork;
  private closed = false;
  private closing?: Promise<void>;

  private constructor(
    storage: SnapshotStorage,
    handle: DocHandle<T>,
    repo: Repo,
    network: OwnedNetwork,
  ) {
    this.storage = storage;
    this.repo = repo;
    this.handle = handle;
    this.network = network;
    this.handle.on('change', this.onChange);
  }

  static async create<T>(
    storage: SnapshotStorage,
    initial: T,
    createNetwork: NetworkFactory = noNetwork,
  ) {
    let network: OwnedNetwork | undefined;
    let repo: Repo | undefined;
    try {
      network = createNetwork();
      repo = new Repo({ network: network.adapters });
      const handle = repo.create(initial);
      const workspace = new DurableRepo<T>(storage, handle, repo, network);
      await workspace.persistChange();
      return workspace;
    } catch (error) {
      try {
        await repo?.shutdown();
      } finally {
        network?.dispose();
      }
      throw error;
    }
  }

  static async open<T>(
    storage: SnapshotStorage,
    documentId: string,
    createNetwork: NetworkFactory = noNetwork,
    signal?: AbortSignal,
  ) {
    if (!isValidDocumentId(documentId)) {
      throw new Error('invalid_document_id');
    }
    let network: OwnedNetwork | undefined;
    let repo: Repo | undefined;
    try {
      network = createNetwork();
      repo = new Repo({ network: network.adapters });
      const binary = await storage.load([documentId, 'workspace']);
      if (!binary && !signal) {
        throw new Error('workspace_not_found');
      }
      const handle = binary
        ? repo.import<T>(binary, { docId: documentId })
        : await repo.find<T>(documentId, { signal });
      const workspace = new DurableRepo<T>(storage, handle, repo, network);
      if (binary) {
        const saved = A.load(binary);
        try {
          workspace.lastSaved = A.getHeads(saved);
        } finally {
          A.free(saved);
        }
      }
      if (!workspace.saved) {
        await workspace.persistChange();
      }
      return workspace;
    } catch (error) {
      try {
        await repo?.shutdown();
      } finally {
        network?.dispose();
      }
      throw error;
    }
  }

  static async restore<T>(storage: SnapshotStorage, binary: Uint8Array) {
    const repo = new Repo();
    try {
      const handle = repo.import<T>(binary);
      const workspace = new DurableRepo<T>(storage, handle, repo, noNetwork());
      await workspace.persistChange();
      return workspace;
    } catch (error) {
      await repo.shutdown();
      throw error;
    }
  }

  private readonly persistChange = () => {
    const doc = this.handle.fullDoc();
    const heads = A.getHeads(doc);
    const binary = A.save(doc);
    const write = this.saving
      .catch(() => undefined)
      .then(async () => {
        await this.storage.save([this.handle.documentId, 'workspace'], binary);
        this.lastSaved = heads;
      });
    this.saving = write;
    // EventEmitter ignores return values. The application observes errors through flush/retry.
    void write.catch(() => undefined);
    return write;
  };

  private readonly onChange = () => {
    void this.persistChange();
  };

  get saved() {
    return JSON.stringify(A.getHeads(this.handle.fullDoc())) === JSON.stringify(this.lastSaved);
  }

  change(change: A.ChangeFn<T>) {
    if (this.closed) {
      throw new Error('workspace_closed');
    }
    this.handle.change(change);
    return this.saving;
  }

  flush() {
    return this.saving;
  }

  retrySave() {
    if (this.closed) {
      return Promise.reject(new Error('workspace_closed'));
    }
    return this.persistChange();
  }

  close() {
    this.closed = true;
    return (this.closing ??= this.finishClose());
  }

  private async finishClose() {
    try {
      await this.repo.shutdown();
    } finally {
      try {
        await this.saving;
      } finally {
        this.handle.off('change', this.onChange);
        this.network.dispose();
      }
    }
  }
}
