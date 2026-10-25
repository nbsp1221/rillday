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
