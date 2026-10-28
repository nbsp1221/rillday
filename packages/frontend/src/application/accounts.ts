import { type Workspace, canonical, createWorkspace, workspaceContents } from '@repo/domain';
import type { WorkspaceRecord as WorkspaceProfile } from './account-record.ts';
import type { AccountRegistry, AccountRepository } from './account-repository.ts';
import type { CredentialSession } from './host.ts';
import type { ClientRuntime } from './runtime.ts';
import type { ServerTransport } from './server-transport.ts';
import type { OpenWorkspace } from './workspace/documents.ts';
import type {
  AccountHostPort,
  AccountHostState,
  ConnectionPort,
  ConnectionState,
  LoginDetails,
} from './workspace/index.ts';
import { createDomainContext } from './context.ts';
import { recoverCapturedInputs } from './recovery-inputs.ts';
import {
  accountResponse,
  connectionResponse,
  loginResponse,
  passwordResponse,
  serverResponse,
  usersResponse,
} from './server-responses.ts';
import { WorkspaceSession } from './workspace-session.ts';

export function normalizeServerUrl(input: string) {
  try {
    const url = new URL(input.trim());
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== '/'
    ) {
      throw new Error('invalid_server_url');
    }
    return url.origin;
  } catch {
    throw new Error('invalid_server_url');
  }
}

const binding = (profile: WorkspaceProfile) =>
  canonical({
    id: profile.id,
    contentId: profile.contentId ?? null,
    generation: profile.generation ?? 0,
    server: profile.server ?? null,
  });

export interface AccountCoordinatorOptions {
  seedGuest?: () => Workspace;
  credentials: CredentialSession;
  transport: ServerTransport;
}

interface PendingConnection {
  profile: WorkspaceProfile;
  token: string;
  document: OpenWorkspace;
  sourceRevision: string;
  remoteRevision: string;
}

const serverScope = (profile: WorkspaceProfile) =>
  profile.server ? `${profile.server.serverId}:${profile.server.userId}` : undefined;

const revision = (document: OpenWorkspace) => document.revision();

export class AccountCoordinator implements AccountHostPort {
  private readonly repository: AccountRepository;
  private readonly runtime: ClientRuntime;
  private readonly options: AccountCoordinatorOptions;
  private registry!: AccountRegistry;
  private state!: AccountHostState;
  private connection: ConnectionState = {
    serverUrl: '',
    server: null,
    busy: false,
    error: '',
    emailHint: '',
    users: [],
    review: null,
    backups: [],
  };
  private readonly hostListeners = new Set<() => void>();
  private readonly connectionListeners = new Set<() => void>();
  private readonly credentials = new Map<string, string>();
  private readonly recoveredDocuments = new Map<string, string>();
  private current: WorkspaceSession | undefined;
  private document!: OpenWorkspace;
  private pending?: PendingConnection;
  private readDrafts: (() => [string, unknown][]) | undefined;
  private activeBinding = '';
  private transition: Promise<unknown> = Promise.resolve();
  private stopped = false;
  private initialization?: Promise<this>;
  private unsubscribeRegistry?: () => void;
  private closing?: Promise<void>;
  readonly connectionPort: ConnectionPort;

  constructor(
    repository: AccountRepository,
    runtime: ClientRuntime,
    options: AccountCoordinatorOptions,
  ) {
    this.repository = repository;
    this.runtime = runtime;
    this.options = options;
    this.connectionPort = {
      registerDrafts: (read) => {
        this.readDrafts = read;
        return () => {
          if (this.readDrafts === read) {
            this.readDrafts = undefined;
          }
        };
      },
      getSnapshot: () => this.connection,
      subscribe: (listener) => {
        this.connectionListeners.add(listener);
        return () => this.connectionListeners.delete(listener);
      },
      checkServer: this.checkServer,
      setup: this.setup,
      login: this.login,
      logout: this.logout,
      confirmConnection: this.confirmConnection,
      cancelConnection: this.cancelConnection,
      downloadConnectionBackup: this.downloadConnectionBackup,
      recoverInputs: async (id) => recoverCapturedInputs(await this.downloadConnectionBackup(id)),
      loadUsers: this.loadUsers,
      createUser: this.createUser,
      setUserDisabled: this.setUserDisabled,
      changePassword: this.changePassword,
      prepareLogin: this.prepareLogin,
    };
  }

  getSnapshot = () => this.state;

  subscribe = (listener: () => void) => {
    this.hostListeners.add(listener);
    return () => this.hostListeners.delete(listener);
  };

  private profile() {
    return this.registry.accounts.find((a) => a.id === this.registry.activeId)!;
  }

  private async saveProfile(profile: WorkspaceProfile) {
    this.registry = await this.repository.saveRegistry({
      ...this.registry,
      accounts: this.registry.accounts.map((account) =>
        account.id === profile.id ? profile : account,
      ),
    });
  }

  private async replaceSession(
    profile: WorkspaceProfile,
    document: OpenWorkspace,
    connection: Partial<ConnectionState> | undefined,
    settingsRequest: number,
    cleanup: (() => Promise<unknown>)[] = [],
  ) {
    const previous = this.current;
    const session = this.session(document, profile);
    this.document = document;
    this.current = session;
    this.recoveredDocuments.clear();
    this.activeBinding = binding(profile);
    const failures: unknown[] = [];
    for (const action of [
      () => connection && this.publishConnection(connection),
      () => this.publishHost(settingsRequest),
      () => previous?.close(),
      ...cleanup,
      () => this.refreshBackups(),
    ]) {
      try {
        await action();
      } catch (error) {
        failures.push(error);
      }
    }
    if (failures.length) {
      throw new Error('connection_cleanup_pending', { cause: new AggregateError(failures) });
    }
  }

  private publishHost(settingsRequest = this.state?.settingsRequest ?? 0) {
    this.state = {
      accounts: this.registry.accounts.map(({ id, name, color, server }) => ({
        id,
        name,
        color,
        ...(server
          ? {
              server: {
                url: server.url,
                email: server.email,
                role: server.role,
              },
            }
          : {}),
      })),
      resetIdentity:
        this.profile().id +
        ':' +
        (this.profile().contentId ?? 'initial') +
        ':' +
        (this.profile().generation ?? 0),
      activeId: this.registry.activeId,
      workspace: this.current!,
      connection: this.connectionPort,
      settingsRequest,
    };
    for (const listener of this.hostListeners) {
      listener();
    }
  }

  private publishConnection(patch: Partial<ConnectionState>) {
    this.connection = { ...this.connection, ...patch };
    for (const listener of this.connectionListeners) {
      listener();
    }
  }

  private async refreshBackups() {
    const backups = await this.repository.connectionBackups(
      this.registry.activeId,
      serverScope(this.profile()),
    );
    this.recoveredDocuments.clear();
    const recovered = [];
    const inspected = new Set<string>();
    for (const backup of backups) {
      const id = 'retained:' + backup.documentId;
      if (backup.documentId === this.document.repository.id || inspected.has(backup.documentId)) {
        continue;
      }
      inspected.add(backup.documentId);
      let document: OpenWorkspace;
      try {
        document = await this.runtime.documents.open(backup.documentId);
      } catch (error) {
        if (error instanceof Error && error.message === 'workspace_not_found') {
          continue;
        }
        throw error;
      }
      try {
        if (
          !backups.some(
            (entry) =>
              entry.documentId === backup.documentId && entry.revision === document.revision(),
          )
        ) {
          this.recoveredDocuments.set(id, backup.documentId);
          recovered.push({
            ...backup,
            id,
            createdAt: new Date().toISOString(),
            drafts: 0,
            contents: workspaceContents(document.repository.getSnapshot().workspace),
          });
        }
      } finally {
        await document.repository.close();
      }
    }
    this.publishConnection({ backups: [...recovered, ...backups] });
  }

  initialize() {
    return (this.initialization ??= this.exclusive(async () => {
      this.registry = await this.repository.loadRegistry();
      this.connection.serverUrl = await this.repository.loadServerUrl();
      await this.activate(this.profile(), 0);
      this.unsubscribeRegistry = this.repository.subscribeRegistry(() => {
        void this.exclusive(() => this.applyRegistryChange()).catch(() => {
          this.publishConnection({ error: 'input_recovery_failed' });
          this.publishHost((this.state?.settingsRequest ?? 0) + 1);
        });
      });
      return this;
    }));
  }

  private async saveBackup(
    profile: WorkspaceProfile,
    reason: 'connection' | 'draft' = 'connection',
  ) {
    const drafts = this.readDrafts?.() ?? [];
    const source: unknown = JSON.parse(await this.current!.exportData());
    await this.repository.saveConnectionBackup(crypto.randomUUID(), profile.id, {
      source: JSON.stringify({ ...(source as Record<string, unknown>), captureDrafts: drafts }),
      documentId: this.document.repository.id,
      revision: this.document.revision(),
      contents: workspaceContents(this.document.repository.getSnapshot().workspace),
      scope: serverScope(profile),
      reason,
      name: profile.name,
      drafts: drafts.length,
    });
  }

  private async applyRegistryChange() {
    const next = await this.repository.readRegistry();
    const profile = next.accounts.find((account) => account.id === next.activeId)!;
    const changed = binding(profile) !== this.activeBinding;
    if (changed) {
      const captured = this.readDrafts?.().length ?? 0;
      const previous = this.current!;
      const previousRegistry = this.registry;
      const resumeInput = previous.pause();
      const resumeNetwork = this.document.pause();
      try {
        await previous.flush();
        await this.saveBackup(this.profile(), captured ? 'draft' : 'connection');
        await this.clearPending();
        this.registry = next;
        await this.activate(profile, 0);
      } finally {
        if (this.current === previous) {
          this.registry = previousRegistry;
          resumeNetwork();
          resumeInput();
        }
      }
      this.publishConnection({ error: captured ? 'saved_inputs_available' : '', review: null });
    } else {
      this.registry = next;
      this.publishHost();
      await this.refreshBackups();
    }
  }

  async flushBeforeClose() {
    await this.transition;
    await this.current?.flush();
  }

  private async transferring<T>(action: () => Promise<T>) {
    this.publishConnection({ transitioning: true });
    try {
      return await action();
    } finally {
      this.publishConnection({ transitioning: false });
    }
  }

  private async busy<T>(action: () => Promise<T>) {
    if (this.connection.busy) {
      throw new Error('operation_in_progress');
    }
    this.publishConnection({ busy: true, error: '' });
    try {
      return await action();
    } catch (error) {
      this.publishConnection({
        error: error instanceof Error ? error.message : 'connection_failed',
      });
      throw error;
    } finally {
      this.publishConnection({ busy: false });
    }
  }

  checkServer = (input: string) =>
    this.busy(async () => {
      if (this.pending) {
        throw new Error('connection_review_pending');
      }
      const url = normalizeServerUrl(input);
      const parsed = serverResponse.safeParse(
        await this.options.transport.request(url, '/v1/server'),
      );
      if (!parsed.success) {
        throw new Error('unsupported_server');
      }
      if (this.profile().server && this.profile().server!.serverId !== parsed.data.serverId) {
        throw new Error('disconnect_first');
      }
      await this.repository.saveServerUrl(url);
      this.publishConnection({ serverUrl: url, server: parsed.data });
      return parsed.data;
    });

  prepareLogin = (account?: { id: string }) => {
    const profile = account
      ? this.registry.accounts.find((profile) => profile.id === account.id)
      : undefined;
    this.publishConnection({
      serverUrl: profile?.server?.url ?? this.connection.serverUrl,
      server: null,
      emailHint: profile?.server?.email ?? '',
      error: '',
      users: [],
    });
    this.publishHost((this.state?.settingsRequest ?? 0) + 1);
  };

  setup = (details: LoginDetails) =>
    this.busy(async () => {
      if (!this.connection.server?.setupRequired) {
        throw new Error('setup_complete');
      }
      try {
        await this.options.transport.request(this.connection.serverUrl, '/v1/setup', {
          email: details.email.trim(),
          password: details.password,
        });
      } catch (error) {
        if ((error as { status?: number }).status === 409) {
          this.publishConnection({
            server: serverResponse.parse(
              await this.options.transport.request(this.connection.serverUrl, '/v1/server'),
            ),
          });
        }
        throw error;
      }
      this.publishConnection({ server: { ...this.connection.server, setupRequired: false } });
      await this.signIn(details);
    });

  login = (details: LoginDetails) => this.busy(() => this.signIn(details));

  private async signIn(details: LoginDetails) {
    if (this.pending) {
      throw new Error('connection_review_pending');
    }
    const server = this.connection.server;
    if (!server) {
      throw new Error('check_server_first');
    }
    const source = this.profile();
    if (source.server && source.server.serverId !== server.serverId) {
      throw new Error('disconnect_first');
    }
    await this.current!.flush();
    await this.options.transport.verifyIdentity(this.connection.serverUrl, server.serverId);
    const { profile, token } = await this.authenticate(
      details,
      source,
      this.connection.serverUrl,
      server,
    );
    await this.exclusive(async () => {
      await this.validate(source);
      if (source.server) {
        await this.remember(profile, token, true);
        await this.activate(profile, (this.state?.settingsRequest ?? 0) + 1, token);
        return;
      }
      await this.reviewConnection(profile, token);
    });
  }

  private async authenticate(
    details: LoginDetails,
    source: WorkspaceProfile,
    url: string,
    server: NonNullable<ConnectionState['server']>,
  ) {
    const loginResult = loginResponse.safeParse(
      await this.options.transport.request(url, '/api/auth/sign-in/email', {
        email: details.email.trim(),
        password: details.password,
      }),
    );
    if (!loginResult.success) {
      throw new Error('invalid_session');
    }

    const login = loginResult.data;
    const account = accountResponse.safeParse(
      await this.options.transport.request(url, '/v1/account', undefined, login.token),
    );
    if (!account.success) {
      throw new Error('invalid_session');
    }

    const user = account.data.user;
    if (source.server && source.server.userId !== user.id) {
      await this.options.transport
        .request(url, '/api/auth/sign-out', {}, login.token)
        .catch(() => undefined);
      throw new Error('disconnect_first');
    }

    const profile: WorkspaceProfile = {
      ...source,
      name: user.email,
      generation: (source.generation ?? 0) + 1,
      server: {
        url,
        serverId: server.serverId,
        userId: user.id,
        email: user.email,
        role: user.role,
      },
    };

    return { profile, token: login.token };
  }

  private remote(profile: WorkspaceProfile, token = '') {
    return profile.server
      ? {
          url: profile.server.url,
          serverId: profile.server.serverId,
          authorize: async (signal: AbortSignal) => {
            await this.options.transport.verifyIdentity(
              profile.server!.url,
              profile.server!.serverId,
              signal,
            );
            return token || this.restoreCredential(profile, signal);
          },
        }
      : undefined;
  }

  private async serverDocument(profile: WorkspaceProfile, token: string): Promise<OpenWorkspace> {
    const remote = this.remote(profile, token)!;
    let { documentId } = connectionResponse.parse(
      await this.options.transport.request(remote.url, '/v1/connection', undefined, token),
    );
    if (!documentId) {
      const created = await this.runtime.documents.create(createWorkspace(createDomainContext()));
      const proposed = created.repository.id;
      await created.repository.close();
      const selected = connectionResponse.parse(
        await this.options.transport.request(
          remote.url,
          '/v1/connection',
          { documentId: proposed },
          token,
        ),
      );
      documentId = selected.documentId;
      if (documentId !== proposed) {
        await this.runtime.documents.remove(proposed);
      }
    }
    if (!documentId) {
      throw new Error('invalid_response');
    }
    return this.runtime.documents.open(documentId, remote);
  }

  private async reviewConnection(profile: WorkspaceProfile, token: string) {
    const document = await this.serverDocument(profile, token);
    this.pending = {
      profile,
      token,
      document,
      sourceRevision: revision(this.document),
      remoteRevision: revision(document),
    };
    this.publishReview();
    if (!this.connection.review!.local.hasData && !this.readDrafts?.().length) {
      await this.performConnection('server-only');
    }
  }

  private publishReview() {
    const pending = this.pending!;
    this.publishConnection({
      review: {
        serverUrl: pending.profile.server!.url,
        email: pending.profile.server!.email,
        name: pending.profile.name,
        local: workspaceContents(this.document.repository.getSnapshot().workspace),
        remote: workspaceContents(pending.document.repository.getSnapshot().workspace),
        drafts: this.readDrafts?.().length ?? 0,
      },
    });
  }

  confirmConnection = (choice: 'include' | 'server-only') =>
    this.busy(() => this.exclusive(() => this.transferring(() => this.performConnection(choice))));

  cancelConnection = () =>
    this.busy(async () => {
      const pending = this.pending;
      await this.clearPending();
      if (pending) {
        await this.options.transport
          .request(pending.profile.server!.url, '/api/auth/sign-out', {}, pending.token)
          .catch(() => undefined);
      }
      this.publishConnection({ review: null });
    });

  private async clearPending() {
    const pending = this.pending;
    this.pending = undefined;
    if (pending) {
      try {
        await pending.document.synchronization?.close();
      } finally {
        await pending.document.repository.close();
      }
    }
  }

  private async performConnection(choice: 'include' | 'server-only') {
    const pending = this.pending;
    if (!pending) {
      throw new Error('connection_review_missing');
    }
    await this.current!.flush();
    const source = this.profile();
    await this.runtime.coordination.withWorkspaceLock(source.id, async () => {
      await this.validate(source);
      if (
        pending.sourceRevision !== revision(this.document) ||
        pending.remoteRevision !== revision(pending.document)
      ) {
        pending.sourceRevision = revision(this.document);
        pending.remoteRevision = revision(pending.document);
        this.publishReview();
        throw new Error('connection_preview_changed');
      }
      if (
        this.document.repository.getSnapshot().decisions.length ||
        pending.document.repository.getSnapshot().decisions.length
      ) {
        throw new Error('resolve_pending_before_disconnect');
      }
      await this.remember(pending.profile, pending.token, true);
      const previous = this.current!;
      const sourceDocument = this.document;
      const resumeInput = previous.pause();
      const resumeSource = sourceDocument.pause();
      const resumeDestination = pending.document.pause();
      try {
        await Promise.all([previous.flush(), pending.document.repository.flush()]);
        const sourceArchive = await this.document.exportData();
        if (
          pending.sourceRevision !== revision(this.document) ||
          pending.remoteRevision !== revision(pending.document) ||
          this.document.repository.getSnapshot().decisions.length ||
          pending.document.repository.getSnapshot().decisions.length
        ) {
          throw new Error('connection_preview_changed');
        }
        await this.saveBackup(source);
        const profile = { ...pending.profile, contentId: pending.document.repository.id };
        await this.saveProfile(profile);
        await this.replaceSession(
          profile,
          pending.document,
          { review: null, users: [] },
          (this.state?.settingsRequest ?? 0) + 1,
          choice === 'include' ? [() => pending.document.includeArchive(sourceArchive)] : [],
        );
      } finally {
        resumeDestination();
        if (this.document === pending.document) {
          this.pending = undefined;
        } else {
          resumeSource();
          resumeInput();
          pending.sourceRevision = revision(this.document);
          pending.remoteRevision = revision(pending.document);
          this.publishReview();
        }
      }
    });
  }

  downloadConnectionBackup = async (id: string) => {
    const retained = this.recoveredDocuments.get(id);
    if (retained) {
      const document = await this.runtime.documents.open(retained);
      try {
        return await document.exportData();
      } finally {
        await document.repository.close();
      }
    }
    return this.repository.downloadConnectionBackup(
      id,
      this.registry.activeId,
      serverScope(this.profile()),
    );
  };

  private async remember(profile: WorkspaceProfile, token: string, required = false) {
    this.credentials.set(profile.id, token);
    try {
      await this.options.credentials.remember(profile.server!, token);
    } catch {
      if (required) {
        throw new Error('credential_store_unavailable');
      }
      this.publishConnection({ error: 'credential_store_unavailable' });
    }
  }

  private async restoreCredential(profile: WorkspaceProfile, signal?: AbortSignal) {
    if (!profile.server) {
      return '';
    }
    const cached = this.credentials.get(profile.id);
    if (cached) {
      return cached;
    }
    const token = await this.options.credentials
      .restore(profile.server, signal)
      .catch((error: unknown) => {
        if (signal) {
          throw error;
        }
        return null;
      });
    if (token) {
      this.credentials.set(profile.id, token);
    }
    return token ?? '';
  }

  private exclusive<T>(action: () => Promise<T>): Promise<T> {
    const next = this.transition.catch(() => undefined).then(action);
    this.transition = next;
    return next;
  }

  private async validate(profile: WorkspaceProfile) {
    const registry = await this.repository.readRegistry();
    const current = registry.accounts.find((a) => a.id === profile.id);
    if (registry.activeId !== profile.id || !current || binding(current) !== binding(profile)) {
      throw new Error('workspace_binding_changed');
    }
  }

  private session(document: OpenWorkspace, profile: WorkspaceProfile) {
    return new WorkspaceSession(document.repository, {
      synchronization: document.synchronization,
      archive: {
        exportData: () => document.exportData(),
        inspectImport: (source) => workspaceContents(this.runtime.documents.inspectArchive(source)),
        importData: (source) =>
          this.exclusive(() => this.transferring(() => this.restoreArchive(source, profile))),
      },
    });
  }

  private async restoreArchive(source: string, profile: WorkspaceProfile) {
    return this.runtime.coordination.withWorkspaceLock(profile.id, () =>
      this.restoreLocked(source, profile),
    );
  }

  private async restoreLocked(source: string, profile: WorkspaceProfile) {
    await this.validate(profile);
    if (profile.server) {
      await this.saveBackup(profile);
      await this.document.replaceArchive(source);
      const document = await this.runtime.documents.open(profile.contentId!, this.remote(profile));
      try {
        const next = { ...profile, generation: (profile.generation ?? 0) + 1 };
        await this.saveProfile(next);
        await this.replaceSession(next, document, undefined, this.state.settingsRequest);
      } finally {
        if (this.document !== document) {
          await document.repository.close();
        }
      }
      return;
    }
    const document = await this.runtime.documents.restoreArchive(source);
    try {
      await this.saveBackup(profile);
      const next = {
        ...profile,
        contentId: document.repository.id,
        generation: (profile.generation ?? 0) + 1,
      };
      await this.saveProfile(next);
      await this.replaceSession(next, document, undefined, this.state.settingsRequest, [
        () => this.runtime.documents.remove(profile.contentId!),
      ]);
    } finally {
      if (this.document !== document) {
        try {
          await document.repository.close();
        } finally {
          await this.runtime.documents.remove(document.repository.id);
        }
      }
    }
  }

  private async activate(profile: WorkspaceProfile, settingsRequest: number, token?: string) {
    if (this.stopped) {
      throw new Error('session_closed');
    }
    const previous = this.current;
    await previous?.flush();
    await this.runtime.coordination.withWorkspaceLock(profile.id, async () => {
      if (!this.current) {
        this.registry = await this.repository.readRegistry();
        profile = this.profile();
      } else {
        await this.validate(this.profile());
      }
      const document = profile.contentId
        ? await this.runtime.documents.open(profile.contentId, this.remote(profile, token))
        : await this.runtime.documents.create(
            this.options.seedGuest?.() ?? createWorkspace(createDomainContext()),
          );
      try {
        profile = { ...profile, contentId: document.repository.id };
        await this.saveProfile(profile);
        await this.replaceSession(
          profile,
          document,
          { users: [], ...(profile.server ? { serverUrl: profile.server.url } : {}) },
          settingsRequest,
        );
      } finally {
        if (this.document !== document) {
          await document.repository.close();
        }
      }
    });
  }

  renameAccount = async (id: string, name: string) => {
    const profile = this.profile();
    if (id !== profile.id) {
      throw new Error('active_account_required');
    }
    await this.runtime.coordination.withWorkspaceLock(
      id,
      async () => {
        await this.validate(profile);
        this.registry = await this.repository.saveRegistry({
          ...this.registry,
          accounts: this.registry.accounts.map((a) => (a.id === id ? { ...a, name } : a)),
        });
        this.publishHost();
      },
      { mode: 'shared' },
    );
  };

  private async activeRequest(path: string, body?: unknown) {
    const profile = this.profile();
    if (!profile.server) {
      throw new Error('login_required');
    }
    await this.options.transport.verifyIdentity(profile.server.url, profile.server.serverId);
    const token = await this.restoreCredential(profile);
    if (!token) {
      throw new Error('login_required');
    }
    return this.options.transport.request(profile.server.url, path, body, token);
  }

  logout = (choice?: 'keep' | 'remove') =>
    this.busy(() =>
      this.exclusive(() =>
        this.transferring(async () => {
          const source = this.profile();
          if (!source.server) {
            return;
          }
          if (!choice) {
            throw new Error('disconnect_confirmation_required');
          }
          await this.current!.flush();
          if (this.current!.getSnapshot().issues.length) {
            throw new Error('resolve_pending_before_disconnect');
          }
          if (choice === 'remove' && this.current!.getSnapshot().pending) {
            throw new Error('sync_before_remove');
          }
          const document =
            choice === 'keep'
              ? await this.runtime.documents.restoreArchive(await this.current!.exportData())
              : await this.runtime.documents.create(createWorkspace(createDomainContext()));
          try {
            await this.runtime.coordination.withWorkspaceLock(source.id, async () => {
              await this.validate(source);
              if (this.readDrafts?.().length) {
                await this.saveBackup(source, 'draft');
              }
              const profile: WorkspaceProfile = {
                id: source.id,
                name: source.name,
                color: source.color,
                contentId: document.repository.id,
                generation: (source.generation ?? 0) + 1,
              };
              await this.saveProfile(profile);
              await this.replaceSession(
                profile,
                document,
                { users: [], server: null, review: null },
                (this.state.settingsRequest ?? 0) + 1,
                [
                  async () => {
                    try {
                      const token = await this.restoreCredential(source);
                      await this.options.transport
                        .request(source.server!.url, '/api/auth/sign-out', {}, token)
                        .catch(() => this.publishConnection({ error: 'remote_logout_pending' }));
                    } finally {
                      this.credentials.delete(source.id);
                    }
                  },
                  () => this.options.credentials.forget(source.server!),
                  () => this.runtime.documents.remove(source.contentId!),
                  ...(choice === 'remove'
                    ? [() => this.repository.removeScopedBackups(source.id, serverScope(source)!)]
                    : []),
                ],
              );
            });
          } finally {
            if (this.document !== document) {
              try {
                await document.repository.close();
              } finally {
                await this.runtime.documents.remove(document.repository.id);
              }
            }
          }
        }),
      ),
    );

  loadUsers = () =>
    this.busy(async () => {
      const result = usersResponse.parse(await this.activeRequest('/v1/admin/users'));
      this.publishConnection({ users: result.users });
    });

  createUser = (details: LoginDetails) =>
    this.busy(async () => {
      await this.activeRequest('/v1/admin/users', {
        email: details.email.trim(),
        password: details.password,
      });
      const users = usersResponse.parse(await this.activeRequest('/v1/admin/users'));
      this.publishConnection({ users: users.users });
    });

  setUserDisabled = (id: string, disabled: boolean) =>
    this.busy(async () => {
      await this.activeRequest('/v1/admin/users/' + encodeURIComponent(id) + '/status', {
        disabled,
      });
      const users = usersResponse.parse(await this.activeRequest('/v1/admin/users'));
      this.publishConnection({ users: users.users });
    });

  changePassword = (currentPassword: string, newPassword: string) =>
    this.busy(async () => {
      const result = passwordResponse.parse(
        await this.activeRequest('/api/auth/change-password', {
          currentPassword,
          newPassword,
          revokeOtherSessions: true,
        }),
      );
      if (typeof result.token === 'string') {
        await this.remember(this.profile(), result.token);
        await this.exclusive(() =>
          this.activate(this.profile(), this.state.settingsRequest, result.token!),
        );
      }
    });

  close() {
    return (this.closing ??= this.finishClose());
  }

  private async finishClose() {
    this.stopped = true;
    this.unsubscribeRegistry?.();
    await this.transition.catch(() => undefined);
    const failures = new Set<unknown>();
    for (const close of [
      () => this.clearPending(),
      () => this.current?.close(),
      () => this.repository.close(),
    ]) {
      try {
        await close();
      } catch (error) {
        failures.add(error);
      }
    }
    this.hostListeners.clear();
    this.connectionListeners.clear();
    if (failures.size === 1) {
      throw [...failures][0];
    }
    if (failures.size) {
      throw new AggregateError([...failures], 'workspace_close_failed', {
        cause: [...failures][0],
      });
    }
  }
}
