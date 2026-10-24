import type { AccountRepository } from './account-repository.ts';
import type { WorkspaceCoordination } from './coordination.ts';
import type { CredentialSession, HostRuntime } from './host.ts';
import type { AppPreferences } from './preferences.ts';
import type { ClientRuntime } from './runtime.ts';
import type { ServerTransport } from './server-transport.ts';
import type { AccountHostPort, ConnectionPort } from './workspace/connection.ts';
import type { WorkspaceDocuments } from './workspace/documents.ts';
import { AccountCoordinator } from './accounts.ts';
import { createDemoWorkspace } from './demo.ts';

export interface PreferencesStore {
  loadPreferences(): Promise<AppPreferences>;
  savePreferences(patch: Partial<AppPreferences>): Promise<void>;
  flushPreferences(): Promise<void>;
}

export interface ApplicationStorage {
  readonly accounts: AccountRepository;
  readonly preferences: PreferencesStore;
  readonly documents: WorkspaceDocuments;
  close(): Promise<void>;
}

export interface ApplicationDependencies {
  storage: ApplicationStorage;
  coordination: WorkspaceCoordination;
  runtime: HostRuntime;
  credentials: CredentialSession;
  transport: ServerTransport;
  demo?: boolean;
}

export interface Application extends AccountHostPort {
  readonly connection: ConnectionPort;
  readonly preferences: Pick<PreferencesStore, 'loadPreferences' | 'savePreferences'>;
  initialize(): Promise<void>;
  flushForExit(): Promise<void>;
  dispose(): Promise<void>;
}

export function createApplication(dependencies: ApplicationDependencies): Application {
  const { storage, coordination } = dependencies;
  const runtime: ClientRuntime = {
    coordination,
    documents: storage.documents,
  };
  const coordinator = new AccountCoordinator(storage.accounts, runtime, {
    runtime: dependencies.runtime,
    credentials: dependencies.credentials,
    transport: dependencies.transport,
    ...(dependencies.demo ? { seedGuest: createDemoWorkspace } : {}),
  });

  return {
    getSnapshot: coordinator.getSnapshot,
    subscribe: coordinator.subscribe,
    renameAccount: coordinator.renameAccount,
    connection: coordinator.connectionPort,
    preferences: storage.preferences,
    initialize: async () => {
      await coordinator.initialize();
    },
    flushForExit: async () => {
      await Promise.all([coordinator.flushBeforeClose(), storage.preferences.flushPreferences()]);
    },
    dispose: async () => {
      try {
        await storage.preferences.flushPreferences();
      } finally {
        try {
          await coordinator.close();
        } finally {
          await storage.close();
        }
      }
    },
  };
}
