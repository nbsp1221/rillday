import { z } from 'zod';
import { serverResponse } from '../../application/server-responses.ts';
import { ServerRequestError, type ServerTransport } from '../../application/server-transport.ts';

export function createFetchServerTransport(): ServerTransport {
  return {
    async request(url, path, body, token) {
      return responseJson(
        await fetchServer(url + path, {
          method: body ? 'POST' : 'GET',
          credentials: 'include',
          headers: {
            ...(body ? { 'content-type': 'application/json' } : {}),
            ...(token ? { authorization: 'Bearer ' + token } : {}),
          },
          ...(body ? { body: JSON.stringify(body) } : {}),
          signal: AbortSignal.timeout(12000),
        }),
      );
    },
    async verifyIdentity(url, serverId, signal = AbortSignal.timeout(12000)) {
      await verifyServerIdentity(
        await fetchServer(url + '/v1/server', {
          credentials: 'omit',
          signal,
        }),
        serverId,
      );
    },
  };
}

export async function fetchServer(input: string, init?: RequestInit) {
  try {
    return await fetch(input, init);
  } catch (error) {
    throw new ServerRequestError(
      0,
      error instanceof Error && error.name === 'TimeoutError'
        ? 'request_timeout'
        : 'network_unavailable',
      { cause: error },
    );
  }
}

export async function verifyServerIdentity(response: Response, serverId: string) {
  const info = serverResponse.safeParse(await responseJson(response));
  if (!info.success) {
    throw new Error('invalid_response');
  }
  if (info.data.serverId !== serverId) {
    throw new Error('server_identity_changed');
  }
}

export async function responseJson(response: Response): Promise<unknown> {
  let value: unknown;
  try {
    value = await response.json();
  } catch (error) {
    if (error instanceof Error && ['AbortError', 'TimeoutError'].includes(error.name)) {
      throw new ServerRequestError(
        0,
        error.name === 'TimeoutError' ? 'request_timeout' : 'network_unavailable',
        { cause: error },
      );
    }
    if (response.ok) {
      throw new Error('invalid_response', { cause: error });
    }
  }
  if (!response.ok) {
    const code = z
      .object({ error: z.string().optional(), code: z.string().optional() })
      .safeParse(value);
    throw new ServerRequestError(
      response.status,
      (code.success ? (code.data.error ?? code.data.code) : undefined) ??
        (response.status === 429
          ? 'rate_limited'
          : response.status >= 500
            ? 'server_unavailable'
            : 'request_failed'),
    );
  }

  return value;
}
