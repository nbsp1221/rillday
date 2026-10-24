import { type WorkspaceContents, hash } from '@repo/domain';
import { type DBSchema, type IDBPDatabase, openDB } from 'idb';
import type { AccountBackup, AccountRegistry } from '#application/account-repository';
import { type AppPreferences, normalizePreferences } from '#application/preferences';
import type { WorkspaceRecord as WorkspaceProfile } from '../../application/account-record.ts';

interface WorkspaceDatabase extends DBSchema {
  metadata: { key: string; value: unknown };
}

interface RecoveryRecord {
  id: string;
  workspaceId: string;
  createdAt: string;
  reason: 'connection' | 'draft';
  contents: WorkspaceContents;
  source: string;
  documentId: string;
  revision: string;
  digest: string;
  scope?: string;
  name?: string;
  drafts?: number;
}

export class BrowserWorkspaceRepository {
  private readonly registryKey: string;
  private database: Promise<IDBPDatabase<WorkspaceDatabase>>;
  private preferencesWrite: Promise<void> = Promise.resolve();
  private registryInitialization?: Promise<AccountRegistry>;
  private registryListeners = new Set<() => void>();
  private registryChannel: BroadcastChannel | undefined;

  constructor({ demo = false }: { demo?: boolean } = {}) {
    this.registryKey = demo ? 'rillday-demo-workspaces' : 'rillday-workspaces';
    this.database = new Promise((resolve, reject) => {
      let blocked = false;
      void openDB<WorkspaceDatabase>(demo ? 'rillday-demo-workspaces' : 'rillday-workspaces', 2, {
        upgrade(db) {
          if (!db.objectStoreNames.contains('metadata')) {
            db.createObjectStore('metadata');
          }
        },
        blocked() {
          blocked = true;
          reject(new Error('startup.databaseBlocked'));
        },
      }).then((db) => {
        if (blocked) {
          db.close();
        } else {
          resolve(db);
        }
      }, reject);
    });
    if (typeof window !== 'undefined' && typeof BroadcastChannel !== 'undefined') {
      this.registryChannel = new BroadcastChannel(
        demo ? 'rillday-demo-registry' : 'rillday-registry',
      );
      this.registryChannel.onmessage = () => {
        for (const listener of this.registryListeners) {
          listener();
        }
      };
    }
  }

  loadRegistry(): Promise<AccountRegistry> {
    return (this.registryInitialization ??= this.readRegistryOnce());
  }

  async loadPreferences(): Promise<AppPreferences> {
    const db = await this.database;
    const value = await db.get('metadata', 'preferences');
    return normalizePreferences(value);
  }

  async loadServerUrl(): Promise<string> {
    const value = await (await this.database).get('metadata', 'serverUrl');
    return typeof value === 'string' ? value : '';
  }

  async saveServerUrl(value: string): Promise<void> {
    const db = await this.database;
    const tx = db.transaction('metadata', 'readwrite', { durability: 'strict' });
    await Promise.all([tx.store.put(value, 'serverUrl'), tx.done]);
  }

  savePreferences(patch: Partial<AppPreferences>) {
    const save = this.preferencesWrite
      .catch(() => undefined)
      .then(async () => {
        const db = await this.database;
        const tx = db.transaction('metadata', 'readwrite', { durability: 'strict' });
        const current = normalizePreferences(await tx.store.get('preferences'));
        const preferences = normalizePreferences({
          ...current,
          ...patch,
          taskViews: { ...current.taskViews, ...patch.taskViews },
        });
        await Promise.all([tx.store.put(preferences, 'preferences'), tx.done]);
      });
    this.preferencesWrite = save;
    return save;
  }

  flushPreferences() {
    return this.preferencesWrite;
  }

  readRegistry() {
    return this.readRegistryOnce();
  }

  subscribeRegistry(listener: () => void) {
    this.registryListeners.add(listener);
    return () => {
      this.registryListeners.delete(listener);
    };
  }

  notifyRegistryChanged() {
    this.registryChannel?.postMessage({ changed: true });
  }

  async saveConnectionBackup(id: string, workspaceId: string, backup: AccountBackup) {
    const db = await this.database;
    const tx = db.transaction('metadata', 'readwrite', { durability: 'strict' });
    const digest = hash(backup.source);
    const key = `recovery:${workspaceId}:${id}`;
    const existing = (await tx.store.get(key)) as RecoveryRecord | undefined;
    if (existing && existing.digest !== digest) {
      tx.abort();
      await tx.done.catch(() => undefined);
      throw new Error('backup_id_reused');
    }
    if (!existing) {
      await tx.store.put(
        {
          id,
          workspaceId,
          createdAt: new Date().toISOString(),
          reason: backup.reason ?? 'connection',
          source: backup.source,
          documentId: backup.documentId,
          revision: backup.revision,
          contents: backup.contents,
          digest,
          scope: backup.scope,
          name: backup.name,
          drafts: backup.drafts ?? 0,
        } satisfies RecoveryRecord,
        key,
      );
    }
    await tx.done;
    if (!existing) {
      this.notifyRegistryChanged();
    }
  }

  async connectionBackups(workspaceId: string, scope?: string) {
    const db = await this.database;
    const keys = await db.getAllKeys('metadata');
    const entries = await Promise.all(
      keys
        .filter((key) => key.startsWith(`recovery:${workspaceId}:`))
        .map((key) => db.get('metadata', key) as Promise<RecoveryRecord>),
    );
    return entries
      .filter((entry) => !entry.scope || entry.scope === scope)
      .map(({ id, createdAt, reason, contents, name, drafts, scope, documentId, revision }) => ({
        id,
        createdAt,
        reason,
        contents,
        name,
        drafts,
        localOnly: !scope,
        documentId,
        revision,
      }));
  }

  async downloadConnectionBackup(id: string, workspaceId: string, scope?: string) {
    const entry = (await (await this.database).get('metadata', `recovery:${workspaceId}:${id}`)) as
      | RecoveryRecord
      | undefined;
    if (!entry || entry.workspaceId !== workspaceId || (entry.scope && entry.scope !== scope)) {
      throw new Error('backup_missing');
    }
    return entry.source;
  }

  async removeScopedBackups(workspaceId: string, scope: string) {
    const tx = (await this.database).transaction('metadata', 'readwrite', { durability: 'strict' });
    for (const key of await tx.store.getAllKeys()) {
      if (key.startsWith(`recovery:${workspaceId}:`)) {
        const entry = (await tx.store.get(key)) as RecoveryRecord;
        if (entry.scope === scope && entry.reason !== 'draft') {
          await tx.store.delete(key);
        }
      }
    }
    await tx.done;
  }

  private async readRegistryOnce(): Promise<AccountRegistry> {
    if (!navigator.locks) {
      throw new Error('web_locks_required');
    }
    return navigator.locks.request(`rillday-registry:${this.registryKey}`, () =>
      this.readRegistryUnlocked(),
    );
  }

  private async readRegistryUnlocked(): Promise<AccountRegistry> {
    const db = await this.database;
    const stored = (await db.get('metadata', 'profiles')) as AccountRegistry | undefined;
    if (stored) {
      if (
        !Array.isArray(stored.accounts) ||
        !stored.accounts.length ||
        !stored.accounts.every((a) => typeof a.id === 'string' && typeof a.name === 'string') ||
        !stored.accounts.some((a) => a.id === stored.activeId)
      ) {
        throw new Error('profiles.detailsUnreadable');
      }
      return stored;
    }
    const accounts: WorkspaceProfile[] = [
      { id: crypto.randomUUID(), name: 'Personal', color: '#7d9cc4' },
    ];
    return this.saveRegistry({ activeId: accounts[0].id, accounts });
  }

  async saveRegistry(registry: AccountRegistry): Promise<AccountRegistry> {
    const db = await this.database;
    const tx = db.transaction('metadata', 'readwrite', { durability: 'strict' });
    const previous = (await tx.store.get('profiles')) as AccountRegistry | undefined;
    const saved = {
      ...registry,
      accounts: [
        ...(previous?.accounts ?? []).filter(
          (a) => !registry.accounts.some((next) => next.id === a.id),
        ),
        ...registry.accounts,
      ],
    };
    await Promise.all([tx.store.put(saved, 'profiles'), tx.done]);
    this.notifyRegistryChanged();
    return saved;
  }

  async close() {
    this.registryChannel?.close();
    this.registryListeners.clear();
    (await this.database).close();
  }
}
