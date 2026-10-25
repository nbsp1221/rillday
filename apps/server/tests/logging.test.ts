import { Writable } from 'node:stream';
import { createServerFixture } from '@repo/test-support';
import { expect, test, vi } from 'vitest';
import { z } from 'zod';
import { HttpFault } from '../src/http-errors.ts';
import { createServer } from '../src/server.ts';

test('standard JSON logs correlate requests and unexpected errors without request contents or error-message secrets', async ({
  onTestFinished,
}) => {
  const chunks: string[] = [];
  const stream = new Writable({
    write(chunk: Buffer, _encoding, done) {
      chunks.push(chunk.toString());
      done();
    },
  });
  const fixture = createServerFixture((options) =>
    createServer({ ...options, logger: { stream } }),
  );
  const server = await fixture();
  onTestFinished(() => server.dispose());
  const secret = 'never-log-this-secret';
  expect(
    (
      await server.app.inject({
        method: 'GET',
        url: '/health?token=' + secret,
        headers: { authorization: 'Bearer ' + secret, cookie: 'session=' + secret },
      })
    ).statusCode,
  ).toBe(200);
  expect((await server.app.inject({ method: 'GET', url: '/v1/connection' })).statusCode).toBe(401);
  vi.spyOn(server.auth, 'session').mockRejectedValueOnce(new Error(`Private failure\n${secret}`));
  const response = await server.app.inject({
    method: 'POST',
    url: '/v1/connection?token=' + secret,
    headers: { authorization: 'Bearer ' + secret, cookie: 'session=' + secret },
    payload: { documentId: 1, title: secret },
  });
  // An invalid body is rejected before its handler; exercise the failing handler separately.
  expect(response.statusCode).toBe(400);
  const failure = await server.app.inject({ method: 'GET', url: '/v1/connection?token=' + secret });
  expect(failure.statusCode).toBe(500);
  expect(failure.json()).toEqual({ error: 'internal_error' });
  vi.mocked(server.auth.session).mockRejectedValueOnce(new HttpFault('storage_failed', 500));
  expect((await server.app.inject({ method: 'GET', url: '/v1/connection' })).statusCode).toBe(500);
  const text = chunks.join('');
  expect(text).not.toContain(secret);
  expect(text).not.toContain('Private failure');
  const logs = text
    .trim()
    .split('\n')
    .map((line) => z.record(z.string(), z.unknown()).parse(JSON.parse(line)));
  const error = logs.find((entry) => entry.level === 50 && entry.msg === 'Request failed');
  expect.assert(error);
  const detail = z.object({ type: z.string(), stack: z.string() }).parse(error.err);
  expect(error.reqId).toBeTypeOf('string');
  expect(detail.type).toBe('Error');
  expect(detail.stack).toContain('at ');
  const sameRequest = logs.filter((entry) => entry.reqId === error.reqId);
  expect(sameRequest.find((entry) => entry.msg === 'incoming request')?.req).toEqual({
    method: 'GET',
    route: '/v1/connection',
  });
  const completion = sameRequest.find((entry) => entry.msg === 'request completed');
  expect.assert(completion);
  expect(completion.res).toEqual({ statusCode: 500 });
  expect(completion.responseTime).toBeTypeOf('number');
  expect(logs.find((entry) => entry.code === 'storage_failed')?.level).toBe(50);
});
