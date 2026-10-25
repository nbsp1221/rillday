import { expect } from 'vitest';
import { z } from 'zod';
import { test } from './support/server-fixture.ts';

test('published OpenAPI describes the account and document connection routes', async ({
  server,
}) => {
  const response = await server.app.inject('/v1/openapi');
  expect(response.statusCode).toBe(200);
  const document = z
    .object({
      openapi: z.string(),
      paths: z.record(z.string(), z.record(z.string(), z.unknown())),
    })
    .parse(response.json<unknown>());
  expect(document.openapi).toMatch(/^3\./);
  for (const [path, method] of [
    ['/v1/server', 'get'],
    ['/v1/setup', 'post'],
    ['/v1/account', 'get'],
    ['/v1/admin/users', 'post'],
    ['/v1/connection', 'get'],
    ['/v1/connection', 'post'],
  ]) {
    expect.assert(method !== undefined);
    expect.assert(path !== undefined);
    expect(document.paths[path]).toHaveProperty(method);
  }
});
