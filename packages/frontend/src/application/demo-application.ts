import type { Application, ApplicationDependencies } from './application.ts';
import type { AccountHostState, ConnectionPort } from './workspace/connection.ts';
import { createApplication } from './application.ts';
import { createDemoWorkspace } from './demo.ts';

export interface DemoApplication extends Application {
  resetSampleData(): Promise<void>;
}

/** The public demo has no credentials or server operations, including direct calls. */
export function createDemoApplication({
  storage,
  coordination,
}: Pick<ApplicationDependencies, 'storage' | 'coordination'>): DemoApplication {
  const unavailable = (): Promise<never> => Promise.reject(new Error('demo_server_disabled'));

  const application = createApplication({
    storage,
    coordination,
    transport: { request: unavailable, verifyIdentity: unavailable },
    demo: true,
    credentials: {
      restore: () => Promise.resolve(null),
      remember: unavailable,
      forget: () => Promise.resolve(),
    },
  });
  const connection: ConnectionPort = {
    ...application.connection,
    serverConnectionEnabled: false,
    checkServer: unavailable,
    setup: unavailable,
    login: unavailable,
    logout: unavailable,
    confirmConnection: unavailable,
    cancelConnection: unavailable,
    loadUsers: unavailable,
    createUser: unavailable,
    setUserDisabled: unavailable,
    changePassword: unavailable,
    prepareLogin: () => {
      throw new Error('demo_server_disabled');
    },
  };
  let previous: AccountHostState | undefined;
  let snapshot: AccountHostState;
  return {
    ...application,
    connection,
    getSnapshot: () => {
      const current = application.getSnapshot();
      if (current !== previous) {
        previous = current;
        snapshot = { ...current, connection };
      }
      return snapshot;
    },
    initialize: async () => {
      const registry = await storage.accounts.loadRegistry();
      // Never restore a server binding from a reused or manually altered demo database.
      if (registry.accounts.some((account) => account.server)) {
        throw new Error('demo_server_disabled');
      }
      await application.initialize();
    },
    resetSampleData: async () => {
      const sample = await storage.documents.create(createDemoWorkspace());
      const id = sample.repository.id;
      try {
        const archive = await sample.exportData();
        // The regular import flow coordinates open tabs and preserves domain behavior.
        await application.getSnapshot().workspace.importData(archive);
      } finally {
        try {
          await sample.repository.close();
        } finally {
          await storage.documents.remove(id);
        }
      }
    },
  };
}
