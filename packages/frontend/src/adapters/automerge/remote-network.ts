import * as Automerge from '@automerge/automerge';
import { WebSocketClientAdapter } from '@automerge/automerge-repo-network-websocket';
import { z } from 'zod';
import type { WorkspaceSynchronization } from '../../application/workspace-session.ts';
import type { RemoteWorkspace } from '../../application/workspace/documents.ts';
import { ServerRequestError } from '../../application/server-transport.ts';
import type { DurableRepo } from './durable-repo.ts';
import type { WorkspaceDocument } from './workspace-document.ts';

const response = z.discriminatedUnion('type', [
  z.object({ type: z.literal('authenticated'), serverId: z.string() }),
  z.object({ type: z.literal('persisted'), heads: z.array(z.string()) }),
]);

// Only authentication and committed-disk acknowledgment surround the native protocol.
export class RemoteWorkspaceNetwork extends WebSocketClientAdapter {
  private readonly observers = new Set<() => void>();
  private status: 'offline' | 'syncing' | 'authentication-required' | 'error' = 'offline';
  private persisted: string[] = [];
  private authenticated = false;
  private error = '';
  private readonly stopped = new AbortController();

  constructor(remote: RemoteWorkspace, documentId: string) {
    const url = new URL('/v1/workspace/' + encodeURIComponent(documentId), remote.url);
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    super(url.href);
    const opened = this.onOpen;
    const received = this.onMessage;
    const closed = this.onClose;
    this.onOpen = () => {
      this.authenticated = false;
      this.status = 'syncing';
      this.error = '';
      this.persisted = [];
      opened();
      const socket = this.socket;
      const signal = AbortSignal.any([this.stopped.signal, AbortSignal.timeout(12000)]);
      void remote.authorize(signal).then(
        (token) => {
          if (signal.aborted) {
            socket?.close();
            return;
          }
          if (this.socket === socket && socket?.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: 'authenticate', token }));
          }
        },
        (error: unknown) => {
          if (this.socket !== socket || this.stopped.signal.aborted) {
            return;
          }
          this.fail(error);
        },
      );
      this.publish();
    };
    this.onMessage = (event) => {
      if (typeof event.data !== 'string') {
        if (this.authenticated) {
          received(event);
        }
        return;
      }
      try {
        const message = response.parse(JSON.parse(event.data));
        if (message.type === 'authenticated') {
          if (message.serverId !== remote.serverId) {
            throw new Error('server_identity_changed');
          }
          this.authenticated = true;
          this.error = '';
          this.join();
        } else {
          if (!this.authenticated) {
            throw new Error('invalid_session');
          }
          this.persisted = message.heads;
        }
        this.publish();
      } catch (error) {
        this.fail(
          error instanceof Error && error.message === 'server_identity_changed'
            ? error
            : new Error('invalid_response', { cause: error }),
        );
      }
    };
    this.onClose = (event?: CloseEvent) => {
      this.status =
        event?.code === 1008 ? 'authentication-required' : this.error ? 'error' : 'offline';
      this.persisted = [];
      this.authenticated = false;
      if (event?.code === 1008) {
        this.error = 'login_required';
        this.disconnect();
      } else {
        closed();
      }
      this.publish();
    };
  }

  private fail(error: unknown) {
    this.error = error instanceof Error ? error.message : 'invalid_response';
    const requiresAuthentication =
      (error instanceof ServerRequestError && [401, 403].includes(error.status)) ||
      ['login_required', 'invalid_session', 'server_identity_changed'].includes(this.error);
    this.status = requiresAuthentication ? 'authentication-required' : 'error';
    if (requiresAuthentication) {
      this.disconnect();
    } else {
      // The SDK owns reconnect timing; temporary failures do not revoke credentials.
      this.socket?.close();
    }
    this.publish();
  }

  override join() {
    if (this.authenticated) {
      super.join();
    }
  }

  private publish = () => {
    for (const listener of this.observers) {
      listener();
    }
  };

  synchronization(document: DurableRepo<WorkspaceDocument>): WorkspaceSynchronization {
    const snapshot = () => {
      const heads = Automerge.getHeads(document.handle.fullDoc());
      const synced =
        this.status === 'syncing' && [...heads].sort().join() === [...this.persisted].sort().join();
      return {
        state: synced ? ('synced' as const) : this.status,
        pending: synced ? 0 : 1,
        error: this.error,
      };
    };

    document.handle.on('change', this.publish);
    return {
      getSnapshot: snapshot,
      subscribe: (listener) => {
        this.observers.add(listener);
        return () => this.observers.delete(listener);
      },
      sync: async () => {
        await document.flush();
        if (snapshot().state === 'synced') {
          return;
        }
        if (this.status === 'offline' || this.status === 'error') {
          this.stopped.signal.throwIfAborted();
          this.disconnect();
          this.status = 'syncing';
          this.error = '';
          this.connect(this.peerId!, this.peerMetadata);
          this.publish();
        }
        const signal = AbortSignal.any([AbortSignal.timeout(12000), this.stopped.signal]);
        signal.throwIfAborted();
        await new Promise<void>((resolve, reject) => {
          const finish = (error?: Error) => {
            this.observers.delete(check);
            signal.removeEventListener('abort', abort);
            if (error) {
              reject(error);
            } else {
              resolve();
            }
          };

          const check = () => {
            const state = snapshot().state;
            if (state === 'synced') {
              finish();
            } else if (state === 'authentication-required') {
              finish(new Error(this.error || 'login_required'));
            } else if (state === 'error') {
              finish(new Error(this.error));
            }
          };

          const abort = () => finish(new Error('network_unavailable', { cause: signal.reason }));

          this.observers.add(check);
          signal.addEventListener('abort', abort, { once: true });
          check();
        });
      },
      close: () => {
        this.stopped.abort(new Error('workspace_closed'));
        document.handle.off('change', this.publish);
        this.disconnect();
        this.observers.clear();
        return Promise.resolve();
      },
    };
  }
}
