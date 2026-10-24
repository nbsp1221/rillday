import type { WebSocket, WebSocketServer } from 'ws';
import { cbor } from '@automerge/automerge-repo';
import { WebSocketServerAdapter } from '@automerge/automerge-repo-network-websocket';

export class DocumentNetwork extends WebSocketServerAdapter {
  private readonly documentId: string;
  private readonly authorized: (socket: WebSocket) => boolean;

  constructor(
    server: WebSocketServer,
    documentId: string,
    authorized: (socket: WebSocket) => boolean,
  ) {
    super(server);
    this.documentId = documentId;
    this.authorized = authorized;
  }

  override receiveMessage(bytes: Uint8Array, socket: WebSocket) {
    if (!this.authorized(socket)) {
      socket.close(1008);
      return;
    }
    try {
      const message: unknown = cbor.decode(bytes);
      if (
        message &&
        typeof message === 'object' &&
        'documentId' in message &&
        message.documentId !== this.documentId
      ) {
        socket.close(1008);
        return;
      }
      super.receiveMessage(bytes, socket);
    } catch {
      socket.close(1008);
    }
  }

  override send(message: Parameters<WebSocketServerAdapter['send']>[0]) {
    const socket = message.targetId ? this.sockets[message.targetId] : undefined;
    if (socket && !this.authorized(socket)) {
      socket.close(1008);
      return;
    }
    super.send(message);
  }
}
