import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import * as Automerge from '@automerge/automerge';
import { type DocHandle, Repo, isValidDocumentId } from '@automerge/automerge-repo';
import { WebSocket, WebSocketServer } from 'ws';
import { z } from 'zod';
import type { Store } from '../../storage.ts';
import type { AccountAuthentication } from '../accounts/index.ts';
import { HttpFault } from '../../http-errors.ts';
import { DocumentNetwork } from './document-network.ts';

type Document = Record<string, unknown>;

interface StoredDocument {
  owner: string;
  documentId: string;
  data: Uint8Array | null;
}

interface SocketSession {
  owner: string;
  sessionId: string;
}

const authentication = z.object({
  type: z.literal('authenticate'),
  token: z.string().min(1).max(4096),
});

class DocumentScope {
  readonly server = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 * 1024 });
  readonly repo: Repo;
  private handle?: DocHandle<Document>;
  private readonly store: Store;
  private readonly record: StoredDocument;
  private readonly permitted: (socket: WebSocket) => boolean;
  private readonly report: (error: unknown) => void;
  private closing?: Promise<void>;
  private saveError: unknown;
  private readonly unsubscribe: () => void;

  constructor(
    store: Store,
    record: StoredDocument,
    permitted: (socket: WebSocket) => boolean,
    report: (error: unknown) => void,
  ) {
    if (!isValidDocumentId(record.documentId)) {
      throw new Error('invalid_document_id');
    }
    this.store = store;
    this.record = record;
    this.permitted = permitted;
    this.report = report;
    if (record.data) {
      const existing = Automerge.load(record.data);
      Automerge.free(existing);
    }
    const network = new DocumentNetwork(this.server, record.documentId, permitted);
    this.repo = new Repo({ network: [network] });
    if (record.data) {
      this.repo.import<Document>(record.data, {
        docId: record.documentId,
      });
    }
    const progress = this.repo.findWithProgress<Document>(record.documentId);
    this.unsubscribe = progress.subscribe((state) => {
      if (state.state === 'ready') {
        this.watch(state.handle);
      }
    });
    const state = progress.peek();
    if (state.state === 'ready') {
      this.watch(state.handle);
    }
  }

  private watch(handle: DocHandle<Document>) {
    if (this.handle === handle) {
      return;
    }
    this.handle?.off('change', this.persist);
    this.handle = handle;
    handle.on('change', this.persist);
    this.persist();
  }

  private readonly persist = () => {
    if (!this.handle?.isReady()) {
      return;
    }
    try {
      const document = this.handle.fullDoc();
      const data = Automerge.save(document);
      // SQLite FULL commits before an acknowledgment is sent to a client.
      this.store
        .prepare('UPDATE workspace_documents SET data=? WHERE owner=? AND documentId=?')
        .run(data, this.record.owner, this.record.documentId);
      this.saveError = undefined;
      const acknowledgment = JSON.stringify({
        type: 'persisted',
        heads: Automerge.getHeads(document),
      });
      for (const socket of this.server.clients) {
        if (socket.readyState === WebSocket.OPEN && this.permitted(socket)) {
          socket.send(acknowledgment);
        }
      }
    } catch (error) {
      this.saveError = error;
      this.report(error);
      for (const socket of this.server.clients) {
        socket.close(1011);
      }
    }
  };

  acknowledge() {
    this.persist();
  }

  close() {
    return (this.closing ??= this.finishClose());
  }

  private async finishClose() {
    this.unsubscribe();
    const failures: unknown[] = [];
    try {
      await this.repo.shutdown();
    } catch (error) {
      failures.push(error);
    }
    this.persist();
    this.handle?.off('change', this.persist);
    try {
      await new Promise<void>((resolve, reject) => {
        this.server.close((error) => {
          if (error) {
            reject(error);
          } else {
            resolve();
          }
        });
      });
    } catch (error) {
      failures.push(error);
    }
    if (this.saveError) {
      failures.push(this.saveError);
    }
    if (failures.length) {
      throw new AggregateError(failures, 'Document shutdown failed');
    }
  }
}

export class SyncService {
  private readonly store: Store;
  private readonly auth: AccountAuthentication;
  private readonly serverId: string;
  private readonly origins: string[];
  private readonly report: (error: unknown) => void;
  private readonly scopes = new Map<string, DocumentScope>();
  private readonly sessions = new WeakMap<WebSocket, SocketSession>();
  private closing?: Promise<void>;

  constructor(
    store: Store,
    auth: AccountAuthentication,
    serverId: string,
    origins: string[],
    report: (error: unknown) => void,
  ) {
    this.store = store;
    this.auth = auth;
    this.serverId = serverId;
    this.origins = origins;
    this.report = report;
  }

  document(owner: string) {
    const row = this.store
      .prepare<StoredDocument>(
        'SELECT owner,documentId,data FROM workspace_documents WHERE owner=?',
      )
      .get(owner);
    return { documentId: row?.documentId ?? null };
  }

  register(owner: string, documentId: string) {
    if (!isValidDocumentId(documentId)) {
      throw new HttpFault('invalid_document');
    }
    const existing = this.document(owner);
    if (existing.documentId) {
      return existing;
    }
    try {
      this.store
        .prepare(
          'INSERT INTO workspace_documents(owner,documentId) VALUES(?,?) ON CONFLICT(owner) DO NOTHING',
        )
        .run(owner, documentId);
    } catch (cause) {
      throw new HttpFault('document_unavailable', 409, { cause });
    }
    return this.document(owner);
  }

  private permitted(socket: WebSocket) {
    const session = this.sessions.get(socket);
    return Boolean(session && this.auth.isSessionActive(session.sessionId, session.owner));
  }

  upgrade = (request: IncomingMessage, socket: Duplex, head: Buffer) => {
    try {
      const url = new URL(request.url ?? '/', 'http://localhost');
      const match = /^\/v1\/workspace\/([^/]+)$/.exec(url.pathname);
      if (
        !match?.[1] ||
        this.closing ||
        (request.headers.origin && !this.origins.includes(request.headers.origin))
      ) {
        socket.destroy();
        return;
      }
      const documentId = decodeURIComponent(match[1]);
      const record = this.store
        .prepare<StoredDocument>(
          'SELECT owner,documentId,data FROM workspace_documents WHERE documentId=?',
        )
        .get(documentId);
      if (!record) {
        socket.destroy();
        return;
      }
      let scope = this.scopes.get(documentId);
      if (!scope) {
        scope = new DocumentScope(
          this.store,
          record,
          (connection) => this.permitted(connection),
          this.report,
        );
        this.scopes.set(documentId, scope);
      }
      const selected = scope;
      selected.server.handleUpgrade(request, socket, head, (connection) => {
        // Native heartbeat starts before its authenticated connection listener.
        Object.assign(connection, { isAlive: true });

        const pendingPong = () => {
          Object.assign(connection, { isAlive: true });
        };

        connection.on('pong', pendingPong);
        const timeout = setTimeout(() => connection.close(1008), 15000);
        connection.on('error', this.report);
        connection.once('close', () => clearTimeout(timeout));
        connection.once('message', (data, binary) => {
          const source = Array.isArray(data)
            ? Buffer.concat(data).toString('utf8')
            : data instanceof ArrayBuffer
              ? new TextDecoder().decode(data)
              : data.toString('utf8');
          void this.authenticate(connection, selected, record, request, source, binary).finally(
            () => {
              clearTimeout(timeout);
              connection.off('pong', pendingPong);
            },
          );
        });
      });
    } catch (error) {
      this.report(error);
      socket.destroy();
    }
  };

  private async authenticate(
    socket: WebSocket,
    scope: DocumentScope,
    record: StoredDocument,
    request: IncomingMessage,
    source: string,
    binary: boolean,
  ) {
    try {
      if (binary) {
        throw new Error('invalid_session');
      }
      const { token } = authentication.parse(JSON.parse(source));
      const session = await this.auth.session({
        ...request.headers,
        authorization: 'Bearer ' + token,
      });
      if (
        !session ||
        session.user.id !== record.owner ||
        !this.auth.isSessionActive(session.id, record.owner)
      ) {
        throw new Error('invalid_session');
      }
      if (socket.readyState !== WebSocket.OPEN) {
        return;
      }
      this.sessions.set(socket, { owner: record.owner, sessionId: session.id });
      socket.send(JSON.stringify({ type: 'authenticated', serverId: this.serverId }));
      scope.server.emit('connection', socket, request);
      scope.acknowledge();
    } catch {
      socket.close(1008);
    }
  }

  close() {
    return (this.closing ??= this.finishClose());
  }

  private async finishClose() {
    const results = await Promise.allSettled(
      [...this.scopes.values()].map((scope) => scope.close()),
    );
    this.scopes.clear();
    const errors = results
      .filter((result) => result.status === 'rejected')
      .map((result) => result.reason as unknown);
    if (errors.length) {
      throw new AggregateError(errors, 'Synchronization shutdown failed');
    }
  }
}
