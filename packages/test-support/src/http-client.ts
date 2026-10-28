import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { accountIdentity, authentication } from './responses.ts';

export const password = 'Synthetic-only-password-2026!';

export class ApiClient {
  origin: string;
  token: string;
  email = '';
  owner = '';

  constructor(origin: string, token: string) {
    this.origin = origin;
    this.token = token;
  }

  async request(
    path: string,
    body?: unknown,
    extra: Record<string, string> = {},
    method = body ? 'POST' : 'GET',
  ) {
    const res = await fetch(this.origin + path, {
      method,
      headers: {
        authorization: 'Bearer ' + this.token,
        origin: this.origin,
        ...(body ? { 'content-type': 'application/json' } : {}),
        ...extra,
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const text = await res.text();
    const responseBody: unknown = text ? JSON.parse(text) : null;
    return {
      status: res.status,
      headers: res.headers,
      body: responseBody,
    };
  }
}

export async function setupAdministrator(
  origin: string,
  email = 'u-' + randomUUID() + '@rillday.test',
) {
  const created = await fetch(origin + '/v1/setup', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      origin,
    },
    body: JSON.stringify({ email, password }),
  });
  assert.equal(created.status, 201, await created.text());

  return signin({ origin, email });
}

export async function createUser(
  administrator: ApiClient,
  email = 'u-' + randomUUID() + '@rillday.test',
) {
  const created = await administrator.request('/v1/admin/users', {
    email,
    password,
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));

  return signin({ origin: administrator.origin, email });
}

export async function signin(a: Pick<ApiClient, 'origin' | 'email'>) {
  const res = await fetch(a.origin + '/api/auth/sign-in/email', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'origin': a.origin },
    body: JSON.stringify({ email: a.email, password }),
  });
  assert.equal(res.status, 200);
  const body = authentication.parse(await res.json());
  const client = new ApiClient(a.origin, body.token);
  client.email = a.email;
  const account = await client.request('/v1/account');
  assert.equal(account.status, 200);
  client.owner = accountIdentity.parse(account.body).user.id;
  return client;
}
