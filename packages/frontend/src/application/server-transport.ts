export interface ServerTransport {
  request(url: string, path: string, body?: unknown, token?: string): Promise<unknown>;
  verifyIdentity(url: string, serverId: string, signal?: AbortSignal): Promise<void>;
}

export class ServerRequestError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, options?: ErrorOptions) {
    super(code, options);
    this.status = status;
    this.code = code;
  }
}
